#!/bin/sh
# Install the instrument splitter (Demucs) for this user: about 1 GB, once. macOS and Linux.
# It goes in ~/.go-play-in-the-band/venv, where the local app looks for it and starts it by itself.
# scripts/build.sh runs this for you unless you pass --no-splitter.
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$HOME/.go-play-in-the-band"
PY="$ROOT/venv/bin/python"

if [ -x "$PY" ] && "$PY" -c 'import sys, importlib.util as u; sys.exit(0 if all(u.find_spec(m) for m in ("demucs", "soundfile", "fastapi", "uvicorn", "multipart")) else 1)' 2>/dev/null; then
  echo "The instrument splitter is already installed in $ROOT/venv"
  exit 0
fi
command -v python3 >/dev/null || { echo "Python 3 is not installed. Get it from https://www.python.org/downloads/ and run this again." >&2; exit 1; }

echo "Installing the instrument splitter into $ROOT/venv (about 1 GB, a few minutes)"
mkdir -p "$ROOT"
python3 -m venv "$ROOT/venv"
"$PY" -m pip install --quiet --upgrade pip
"$PY" -m pip install -r "$HERE/server/requirements.txt" demucs soundfile librosa
echo "Done. Open the app and press Instruments. Without the app: scripts/run-server.sh"
