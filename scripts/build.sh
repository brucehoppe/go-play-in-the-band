#!/usr/bin/env bash
# Build Go Play in the Band as a local app on macOS (or Linux).
#
#   ./scripts/build.sh                 build, test, and package into ./out
#   ./scripts/build.sh --out ~/Desktop choose the output folder
#   ./scripts/build.sh --skip-tests    skip the test suites
#   ./scripts/build.sh --install       macOS: also copy the app to ~/Applications
#   ./scripts/build.sh --no-splitter   skip the instrument splitter (Demucs, about 1 GB, installed once)
#
# Steps: Rust/WASM core -> web app (web/dist) -> one Rust program with the web app inside it
# -> the instrument splitter in ~/.go-play-in-the-band, which the app starts by itself.
# On macOS that program is wrapped as "Go Play in the Band.app". On Windows use build.ps1.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

OUT="out" TESTS=1 INSTALL=0 SPLITTER=1
while [ $# -gt 0 ]; do
  case "$1" in
    --out)        [ $# -ge 2 ] || { echo "--out needs a folder" >&2; exit 1; }; OUT="$2"; shift ;;
    --skip-tests) TESTS=0 ;;
    --install)    INSTALL=1 ;;
    --no-splitter) SPLITTER=0 ;;
    -h|--help)    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)            echo "unknown option: $1 (try --help)" >&2; exit 1 ;;
  esac
  shift
done

need() { command -v "$1" >/dev/null || { echo "$1 is not installed. $2" >&2; exit 1; }; }
need node      "Get Node.js 24+ from https://nodejs.org/"
need cargo     "Get Rust from https://rustup.rs/"
need wasm-pack "Install it with: cargo install wasm-pack"
rustup target list --installed | grep -q wasm32-unknown-unknown || rustup target add wasm32-unknown-unknown

echo "==> Web app (WASM core, type-check, bundle)"
( cd web && npm ci --no-audit --no-fund && npm run build )

if [ "$TESTS" = 1 ]; then
  echo "==> Tests"
  cargo test --quiet --manifest-path dsp-core/Cargo.toml
  ( cd web && npm test )
  cargo test --quiet --manifest-path desktop/Cargo.toml
fi

echo "==> Local app"
cargo build --release --manifest-path desktop/Cargo.toml
BIN="desktop/target/release/go-play-in-the-band"
VERSION="$("$BIN" --version | awk '{print $2}')"
mkdir -p "$OUT"

splitter() {
  [ "$SPLITTER" = 1 ] || { echo "==> Skipped the instrument splitter. Add it later with: scripts/install.sh"; return 0; }
  echo "==> Instrument splitter"
  # The app works without it, so a failure here (no Python, no network) does not fail the build.
  sh scripts/install.sh || echo "    The splitter was not installed; everything else works. Try again with: scripts/install.sh"
}

if [ "$(uname -s)" != "Darwin" ]; then
  cp "$BIN" "$OUT/go-play-in-the-band"
  splitter
  echo "==> Built $OUT/go-play-in-the-band. Run it to open the app in your browser."
  exit 0
fi

APP="$OUT/Go Play in the Band.app"
# Only ever replace the app bundle this script makes, by its exact name.
if [ -d "$APP" ]; then rm -rf "$APP"; fi
mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/go-play-in-the-band"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Go Play in the Band</string>
  <key>CFBundleDisplayName</key><string>Go Play in the Band</string>
  <key>CFBundleIdentifier</key><string>io.github.brucehoppe.go-play-in-the-band</string>
  <key>CFBundleExecutable</key><string>go-play-in-the-band</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSUIElement</key><true/>
</dict></plist>
PLIST
# Ad-hoc signature so macOS will run a locally built app.
codesign --force --sign - "$APP" >/dev/null 2>&1 || echo "    (codesign not available; the app is unsigned)"
echo "==> Built $APP ($(du -sh "$APP" | cut -f1))"

if [ "$INSTALL" = 1 ]; then
  DEST="$HOME/Applications/Go Play in the Band.app"
  mkdir -p "$HOME/Applications"
  if [ -d "$DEST" ]; then rm -rf "$DEST"; fi
  cp -R "$APP" "$DEST"
  echo "==> Installed to $DEST"
fi
splitter
echo "    Open it like any app. It opens in your browser. Quit on the page stops it."
