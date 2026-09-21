#!/bin/sh
# Start the instrument splitter by hand, on 127.0.0.1 only. The local app does this for you;
# use this with the hosted demo or `npm run dev`. Install it first with scripts/install.sh.
cd "$(dirname "$0")/../server" || exit 1
PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
[ -x "$HOME/.go-play-in-the-band/venv/bin/python" ] && PY="$HOME/.go-play-in-the-band/venv/bin/python"
exec "$PY" -m uvicorn app:app --host 127.0.0.1 --port 8765
