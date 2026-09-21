# Install the instrument splitter (Demucs) for this user: about 1 GB, once. Windows.
# It goes in %USERPROFILE%\.go-play-in-the-band\venv, where the local app looks for it and starts it by itself.
# scripts\build.ps1 runs this for you unless you pass -NoSplitter.
$ErrorActionPreference = "Stop"
$here = Split-Path $PSScriptRoot -Parent
$root = Join-Path $env:USERPROFILE ".go-play-in-the-band"
$py = Join-Path $root "venv\Scripts\python.exe"

if (Test-Path $py) {
  & $py -c 'import sys, importlib.util as u; sys.exit(0 if all(u.find_spec(m) for m in ("demucs", "soundfile", "fastapi", "uvicorn", "multipart")) else 1)' 2>$null
  if ($LASTEXITCODE -eq 0) { Write-Host "The instrument splitter is already installed in $root\venv"; exit 0 }
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Error "Python 3 is not installed. Get it from https://www.python.org/downloads/ and run this again."
}
Write-Host "Installing the instrument splitter into $root\venv (about 1 GB, a few minutes)"
New-Item -ItemType Directory -Force -Path $root | Out-Null
python -m venv (Join-Path $root "venv")
& $py -m pip install --quiet --upgrade pip
& $py -m pip install -r (Join-Path $here "server\requirements.txt") demucs soundfile librosa
if ($LASTEXITCODE -ne 0) { Write-Error "pip could not install the splitter." }
Write-Host "Done. Open the app and press Instruments. Without the app: scripts\run-server.ps1"
