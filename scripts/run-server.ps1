# Start the instrument splitter by hand, on 127.0.0.1 only. The local app does this for you;
# use this with the hosted demo or `npm run dev`. Install it first with scripts\install.ps1.
Set-Location (Join-Path $PSScriptRoot "..\server")
$py = "python"
if (Test-Path ".venv\Scripts\python.exe") { $py = ".venv\Scripts\python.exe" }
$mine = Join-Path $env:USERPROFILE ".go-play-in-the-band\venv\Scripts\python.exe"
if (Test-Path $mine) { $py = $mine }
& $py -m uvicorn app:app --host 127.0.0.1 --port 8765
