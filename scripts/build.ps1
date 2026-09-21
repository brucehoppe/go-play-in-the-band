# Build Go Play in the Band as a local app on Windows.
#
#   .\scripts\build.ps1                  build, test, and put the program in .\out
#   .\scripts\build.ps1 -Out C:\Apps     choose the output folder
#   .\scripts\build.ps1 -SkipTests       skip the test suites
#   .\scripts\build.ps1 -NoSplitter      skip the instrument splitter (Demucs, about 1 GB, installed once)
#
# Steps: Rust/WASM core -> web app (web\dist) -> one Rust program with the web app inside it
# -> the instrument splitter in %USERPROFILE%\.go-play-in-the-band, which the app starts by itself.
# On macOS use build.sh.
param(
  [string]$Out = "out",
  [switch]$SkipTests,
  [switch]$NoSplitter
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Need($name, $hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "$name is not installed. $hint" }
}
function Run($what, [scriptblock]$block) {
  & $block
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" }
}
Need node      "Get Node.js 24+ from https://nodejs.org/"
Need cargo     "Get Rust from https://rustup.rs/"
Need wasm-pack "Install it with: cargo install wasm-pack"
if (-not ((rustup target list --installed) -match "wasm32-unknown-unknown")) {
  Run "rustup target add" { rustup target add wasm32-unknown-unknown }
}

Write-Host "==> Web app (WASM core, type-check, bundle)"
Push-Location web
try {
  Run "npm ci" { npm ci --no-audit --no-fund }
  Run "npm run build" { npm run build }
  if (-not $SkipTests) { Run "web tests" { npm test } }
} finally { Pop-Location }

if (-not $SkipTests) {
  Write-Host "==> Tests"
  Run "dsp-core tests" { cargo test --quiet --manifest-path dsp-core/Cargo.toml }
  Run "desktop tests" { cargo test --quiet --manifest-path desktop/Cargo.toml }
}

Write-Host "==> Local app"
Run "cargo build" { cargo build --release --manifest-path desktop/Cargo.toml }
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$exe = Join-Path $Out "Go Play in the Band.exe"
Copy-Item "desktop\target\release\go-play-in-the-band.exe" $exe -Force
$size = [math]::Round((Get-Item $exe).Length / 1MB, 1)
Write-Host "==> Built $exe ($size MB)"
if ($NoSplitter) {
  Write-Host "==> Skipped the instrument splitter. Add it later with: scripts\install.ps1"
} else {
  Write-Host "==> Instrument splitter"
  # The app works without it, so a failure here (no Python, no network) does not fail the build.
  try { & (Join-Path $PSScriptRoot "install.ps1") }
  catch { Write-Host "    The splitter was not installed; everything else works. Try again with: scripts\install.ps1" }
  $global:LASTEXITCODE = 0
}
Write-Host "    Double-click it. It opens in your browser and stops by itself after you close the page."
