#!/bin/sh
# Render web/public/favicon.svg into an .icns for the Mac app, with the tools macOS ships.
#   sh scripts/make-icon.sh out/AppIcon.icns
set -e
cd "$(dirname "$0")/.."
OUT="${1:?usage: make-icon.sh <AppIcon.icns>}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# Quick Look rasterises the SVG; sips resizes it to every size an icon set needs.
qlmanage -t -s 1024 -o "$TMP" web/public/favicon.svg >/dev/null 2>&1
BIG="$TMP/favicon.svg.png"
[ -f "$BIG" ]
SET="$TMP/AppIcon.iconset"
mkdir -p "$SET"
for n in 16 32 128 256 512; do
  sips -z "$n" "$n" "$BIG" --out "$SET/icon_${n}x${n}.png" >/dev/null
  d=$((n * 2))
  sips -z "$d" "$d" "$BIG" --out "$SET/icon_${n}x${n}@2x.png" >/dev/null
done
mkdir -p "$(dirname "$OUT")"
iconutil -c icns "$SET" -o "$OUT"
echo "$OUT"
