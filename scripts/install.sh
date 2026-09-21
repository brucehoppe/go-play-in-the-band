#!/bin/sh
# Set up the optional local backend in server/.venv (macOS, Linux).
#   scripts/install.sh           the small server only
#   scripts/install.sh --stems   also Demucs, for splitting a song into instruments (large: about 1 GB)
set -e
cd "$(dirname "$0")/../server"
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
if [ "$1" = "--stems" ]; then
  .venv/bin/python -m pip install demucs soundfile librosa
  echo "Done, with Demucs. Start the backend with: scripts/run-server.sh"
else
  echo "Done. To split songs into instruments, run: scripts/install.sh --stems"
fi
