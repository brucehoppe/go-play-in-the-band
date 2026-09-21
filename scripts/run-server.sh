#!/bin/sh
# Start the optional local backend on 127.0.0.1 only. Uses server/.venv when install.sh made one.
cd "$(dirname "$0")/../server" || exit 1
PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
exec "$PY" -m uvicorn app:app --host 127.0.0.1 --port 8765
