# Set up the optional local backend in a virtual environment (Windows).
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\server")
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Write-Host "Done. For stem separation also run: .\.venv\Scripts\python.exe -m pip install demucs"
Write-Host "Start the backend with: scripts\run-server.ps1 (after activating .venv)"
