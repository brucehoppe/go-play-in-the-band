#!/bin/sh
# Start the optional local backend on 127.0.0.1 only.
cd "$(dirname "$0")/../server" && python3 -m uvicorn app:app --host 127.0.0.1 --port 8765
