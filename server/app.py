"""The instrument splitter: stem separation and analysis, on this computer. Binds to 127.0.0.1 only."""
from pathlib import Path
import os
import signal
import tempfile
import threading
import time

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from cache import cache_dir, content_hash

CACHE_ROOT = Path.home() / ".go-play-in-the-band" / "cache"
MAX_BYTES = 200 * 1024 * 1024

app = FastAPI(title="Go Play in the Band server")
# Only this app may call the backend: the dev server, the local app, and the hosted demo.
ALLOWED_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:8766",
    "http://localhost:8766",
    "https://brucehoppe.github.io",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def private_network(request: Request, call_next):
    """Chrome asks before a public page (the hosted demo) may call 127.0.0.1; say yes to our own origins only."""
    response = await call_next(request)
    if request.headers.get("origin") in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


SUFFIXES = {".wav", ".mp3", ".flac", ".m4a", ".aac", ".ogg"}
# A stem quieter than this, relative to the loudest stem, is treated as empty (that instrument is not in the song).
SILENT_DB = -40.0


def _device() -> str:
    try:
        import torch

        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def audible_stems(folder: Path) -> list[str]:
    """Stem files worth showing, loudest first. Demucs always writes six; most songs do not have all six."""
    import numpy as np
    import soundfile as sf

    levels = {}
    for path in folder.rglob("*.wav"):
        data, _ = sf.read(path, always_2d=True)
        levels[path.name] = float(np.sqrt(np.mean(np.square(data)))) if len(data) else 0.0
    loudest = max(levels.values(), default=0.0)
    if loudest <= 0:
        return []
    keep = [n for n, v in levels.items() if v > 0 and 20 * np.log10(v / loudest) > SILENT_DB]
    return sorted(keep, key=lambda n: -levels[n])


def orphaned(started_by: int | None, parent_now: int) -> bool:
    """True when the local app that started this server is gone (it crashed or was force-quit)."""
    return started_by is not None and parent_now != started_by


def _stop_when_orphaned(started_by: int) -> None:
    # When a parent dies the system adopts the child, so its parent id changes. Not so on Windows,
    # where this never fires and the app's own stop on exit is all there is.
    while not orphaned(started_by, os.getppid()):
        time.sleep(5)
    os.kill(os.getpid(), signal.SIGTERM)


if os.environ.get("GPITB_PARENT_PID", "").isdigit():
    threading.Thread(target=_stop_when_orphaned, args=(int(os.environ["GPITB_PARENT_PID"]),), daemon=True).start()


@app.get("/health")
def health() -> dict:
    return {"ok": True}


async def _read(upload: UploadFile) -> bytes:
    data = await upload.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large")
    return data


@app.post("/analyse")
async def analyse(file: UploadFile = File(...)) -> JSONResponse:
    data = await _read(file)
    try:
        import librosa  # optional dependency
    except ImportError:
        raise HTTPException(501, "Install librosa to enable tempo detection")
    with tempfile.NamedTemporaryFile(suffix=Path(file.filename or "a.wav").suffix) as f:
        f.write(data)
        f.flush()
        y, sr = librosa.load(f.name, mono=True)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    return JSONResponse({"hash": content_hash(data), "bpm": float(tempo)})


@app.post("/separate")
async def separate(file: UploadFile = File(...)) -> JSONResponse:
    data = await _read(file)
    digest = content_hash(data)
    out = cache_dir(CACHE_ROOT, digest)
    if any(out.rglob("*.wav")):
        return JSONResponse({"hash": digest, "stems": audible_stems(out), "cached": True})
    try:
        import demucs.separate  # optional dependency, large
    except ImportError:
        raise HTTPException(501, "Install demucs to enable stem separation")
    suffix = Path(file.filename or "").suffix.lower()
    src = out / f"input{suffix if suffix in SUFFIXES else '.wav'}"
    src.write_bytes(data)
    args = ["-n", "htdemucs_6s", "-d", _device(), "-o", str(out), "--filename", "{stem}.{ext}", str(src)]
    try:
        # Separation takes a while; run it off the event loop so /health still answers.
        await run_in_threadpool(demucs.separate.main, args)
    except SystemExit as exc:
        raise HTTPException(422, "Demucs could not read that file") from exc
    finally:
        src.unlink(missing_ok=True)
    return JSONResponse({"hash": digest, "stems": audible_stems(out), "cached": False})


@app.get("/stems/{digest}/{name}")
def stem(digest: str, name: str) -> FileResponse:
    if not name.endswith(".wav") or not name[:-4].isalnum():
        raise HTTPException(400, "Bad stem name")
    try:
        root = cache_dir(CACHE_ROOT, digest)
    except ValueError:
        raise HTTPException(400, "Bad hash")
    found = next(root.rglob(name), None)
    if found is None:
        raise HTTPException(404, "No such stem")
    return FileResponse(found, media_type="audio/wav")
