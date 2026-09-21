"""Optional local backend: stem separation and analysis. Binds to 127.0.0.1 only."""
from pathlib import Path
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from cache import cache_dir, content_hash

CACHE_ROOT = Path.home() / ".go-play-in-the-band" / "cache"
MAX_BYTES = 200 * 1024 * 1024

app = FastAPI(title="Go Play in the Band server")
# Only the local dev and installed app origins may call this.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


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
    cached = sorted(p.name for p in out.glob("*.wav"))
    if cached:
        return JSONResponse({"hash": digest, "stems": cached, "cached": True})
    try:
        import demucs.separate  # optional dependency, large
    except ImportError:
        raise HTTPException(501, "Install demucs to enable stem separation")
    src = out / "input"
    src.write_bytes(data)
    demucs.separate.main(["-n", "htdemucs_6s", "-o", str(out), "--filename", "{stem}.{ext}", str(src)])
    stems = sorted(p.name for p in out.rglob("*.wav"))
    return JSONResponse({"hash": digest, "stems": stems, "cached": False})
