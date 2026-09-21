# Start the optional local backend on 127.0.0.1 only. Uses server\.venv when install.ps1 made one.
Set-Location (Join-Path $PSScriptRoot "..\server")
$py = "python"
if (Test-Path ".venv\Scripts\python.exe") { $py = ".venv\Scripts\python.exe" }
& $py -m uvicorn app:app --host 127.0.0.1 --port 8765
