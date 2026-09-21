#!/bin/sh
# Set up the optional local backend in a virtual environment (macOS).
set -e
cd "$(dirname "$0")/../server"
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
echo "Done. For stem separation also run: .venv/bin/python -m pip install demucs"
echo "Start the backend with: scripts/run-server.sh (after activating .venv)"
