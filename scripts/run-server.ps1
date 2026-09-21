# Start the optional local backend on 127.0.0.1 only.
Set-Location (Join-Path $PSScriptRoot "..\server")
python -m uvicorn app:app --host 127.0.0.1 --port 8765
