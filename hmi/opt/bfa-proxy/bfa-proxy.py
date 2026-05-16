#!/usr/bin/env python3
"""Tiny reverse proxy: HMI:80 -> 10.0.2.1:5051 (bfa-design).

Auto-injects bfa_user=HMI cookie so the kiosk bypasses the login wall.
The upstream auth is a trivial name-cookie; the kiosk identifies as 'HMI'.
"""
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

UPSTREAM = "http://10.0.2.1:5051"
KIOSK_COOKIE = "bfa_user=HMI"
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade",
}


def _merge_cookie(existing: str | None) -> str:
    if not existing:
        return KIOSK_COOKIE
    if "bfa_user=" in existing:
        return existing
    return existing.rstrip("; ") + "; " + KIOSK_COOKIE


class Proxy(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _proxy(self, method):
        url = UPSTREAM + self.path
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_BY_HOP and k.lower() != "host"}
        headers["Cookie"] = _merge_cookie(headers.get("Cookie"))
        headers["X-Forwarded-For"] = self.client_address[0]
        headers["X-Forwarded-Host"] = self.headers.get("Host", "")
        headers["X-Forwarded-Proto"] = "http"

        req = Request(url, data=body, headers=headers, method=method)
        try:
            resp = urlopen(req, timeout=30)
            status = resp.status
            r_headers = resp.headers
            r_body = resp.read()
        except HTTPError as e:
            status = e.code
            r_headers = e.headers
            r_body = e.read() or b""
        except (URLError, socket.timeout) as e:
            self.send_error(502, f"upstream error: {e}")
            return

        self.send_response(status)
        for k, v in r_headers.items():
            if k.lower() in HOP_BY_HOP or k.lower() == "content-length":
                continue
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(r_body)))
        self.end_headers()
        self.wfile.write(r_body)

    def do_GET(self):     self._proxy("GET")
    def do_POST(self):    self._proxy("POST")
    def do_PUT(self):     self._proxy("PUT")
    def do_DELETE(self):  self._proxy("DELETE")
    def do_PATCH(self):   self._proxy("PATCH")
    def do_HEAD(self):    self._proxy("HEAD")
    def do_OPTIONS(self): self._proxy("OPTIONS")

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", 80), Proxy)
    print(f"bfa-proxy listening on :80 -> {UPSTREAM} (kiosk cookie injected)", flush=True)
    srv.serve_forever()
