# Set up the optional local backend in server\.venv (Windows).
#   scripts\install.ps1          the small server only
#   scripts\install.ps1 -Stems   also Demucs, for splitting a song into instruments (large: about 1 GB)
param([switch]$Stems)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\server")
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if ($Stems) {
  .\.venv\Scripts\python.exe -m pip install demucs soundfile librosa
  Write-Host "Done, with Demucs. Start the backend with: scripts\run-server.ps1"
} else {
  Write-Host "Done. To split songs into instruments, run: scripts\install.ps1 -Stems"
}
