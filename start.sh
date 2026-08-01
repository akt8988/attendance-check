#!/bin/sh
# macOS / Linux local server (127.0.0.1 only). For development/testing.
cd "$(dirname "$0")"
PORT=8787
URL="http://127.0.0.1:${PORT}/"
echo "出欠管理アプリを起動します（この端末のみ）"
echo "ブラウザで開く: ${URL}"
echo "停止: Ctrl+C"
if command -v python3 >/dev/null 2>&1; then
  exec python3 ./server.py --port "$PORT" --no-browser
else
  echo "python3 が必要です"
  exit 1
fi
