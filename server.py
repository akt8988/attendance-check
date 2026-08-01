#!/usr/bin/env python3
"""Local-only static server with GET/PUT /api/data for attendance-data.json."""

from __future__ import annotations

import argparse
import json
import functools
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "attendance-data.json"
MAX_BODY = 8 * 1024 * 1024


def ensure_data_file() -> None:
    DATA.parent.mkdir(parents=True, exist_ok=True)
    if not DATA.exists():
        DATA.write_text('{\n  "version": 1,\n  "courses": []\n}\n', encoding="utf-8")


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] == "/api/data":
            body = DATA.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def do_PUT(self) -> None:
        if self.path.split("?", 1)[0] != "/api/data":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_BODY:
            self.send_error(413)
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict) or not isinstance(payload.get("courses"), list):
                raise ValueError("bad shape")
        except Exception:
            self.send_error(400, "Invalid JSON")
            return
        tmp = DATA.with_suffix(".json.tmp")
        tmp.write_bytes(raw)
        tmp.replace(DATA)
        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    ensure_data_file()
    url = f"http://127.0.0.1:{args.port}/"
    server = ThreadingHTTPServer(
        ("127.0.0.1", args.port),
        functools.partial(Handler, directory=str(ROOT)),
    )
    print("Attendance app started (this PC only).")
    print("Open in browser:", url)
    print("Data:", DATA)
    print("To stop: Ctrl+C")
    print("No data is sent to the internet.")
    print("")
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
