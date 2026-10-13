# Windows 試作 exe（専用ウィンドウ）
#
# 使い方（macOS / Linux から）:
#   ./desktop/build.sh
# 成果物:
#   dist/AttendanceCheck.exe
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/desktop/web"
OUT="$ROOT/dist/AttendanceCheck.exe"

rm -rf "$DEST"
mkdir -p "$DEST/css" "$DEST/js" "$DEST/vendor"

cp "$ROOT/index.html" "$DEST/"
cp "$ROOT/css/app.css" "$DEST/css/"
cp "$ROOT/js/"*.js "$DEST/js/"
cp "$ROOT/vendor/xlsx.full.min.js" "$DEST/vendor/"
cp "$ROOT/favicon.svg" "$ROOT/favicon-32.png" "$ROOT/apple-touch-icon.png" "$DEST/"

mkdir -p "$ROOT/dist"
cd "$ROOT/desktop"

export CGO_ENABLED=0
export GOOS=windows
export GOARCH=amd64

go build -trimpath -ldflags="-s -w -H windowsgui" -o "$OUT" .

echo "Built $OUT"
