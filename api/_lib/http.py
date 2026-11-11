"""Small helpers for the public JSON endpoints used by the website."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from .config import log

MAX_BODY = 8 * 1024


class JsonHandler(BaseHTTPRequestHandler):
    """Base handler: JSON in/out, no access log, same-origin POSTs only."""

    def query(self) -> dict[str, str]:
        return {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}

    def body(self) -> dict | None:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return None
        try:
            data = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None
        return data if isinstance(data, dict) else None

    def send_json(self, status: int, payload: dict, cache: str = "no-store") -> None:
        data = json.dumps(payload, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
        self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        self.send_header("Content-Length", str(len(data)))
        for k, v in getattr(self, "extra_headers", []):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def error(self, status: int, code: str, message: str, **extra) -> None:
        self.send_json(status, {"ok": False, "error": code, "message": message, **extra})

    def same_origin(self) -> bool:
        """Reject cross-site POSTs. Browsers always send Origin on POST fetches."""
        origin = self.headers.get("Origin")
        if not origin:
            return True  # non-browser clients; still rate limited
        host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or ""
        allowed = {f"https://{host}", f"http://{host}"}
        allowed |= {o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()}
        return origin in allowed

    def client_ip(self) -> str:
        # Vercel sets these itself (a visitor can't spoof them); X-Forwarded-For is the local-dev fallback.
        for h in ("X-Vercel-Forwarded-For", "X-Real-IP", "X-Forwarded-For"):
            v = self.headers.get(h, "")
            if v:
                return v.split(",")[0].strip()
        return self.client_address[0] or "unknown"

    def log_message(self, *args):  # no access logs (they would contain personal data)
        pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "GET, POST, OPTIONS")
        self.end_headers()


def _salt() -> bytes:
    return (os.environ.get("IP_HASH_SALT") or os.environ.get("CRON_SECRET") or "qoui-dev-salt").encode()


def ip_hash(ip: str) -> str:
    return hmac.new(_salt(), ip.encode(), hashlib.sha256).hexdigest()[:32]


def new_token() -> tuple[str, str]:
    """(token for the browser, hash for the database)."""
    token = secrets.token_urlsafe(24)
    return token, token_hash(token)


def token_hash(token: str) -> str:
    return hashlib.sha256(str(token).encode()).hexdigest()


def normalise_phone(raw: str) -> str | None:
    """Kenyan numbers in any common form -> 2547XXXXXXXX / 2541XXXXXXXX. International +CC... allowed."""
    s = re.sub(r"[\s\-().]", "", str(raw or ""))
    m = re.fullmatch(r"(?:\+?254|0)?([17]\d{8})", s)
    if m:
        return "254" + m.group(1)
    if re.fullmatch(r"\+[1-9]\d{7,14}", s) and not s.startswith("+254"):
        return s[1:]
    return None


def safe(fn):
    """Decorator: any unexpected error becomes a clean 500 (details only in logs)."""
    def wrapper(self, *a, **kw):
        try:
            return fn(self, *a, **kw)
        except Exception:
            log.exception("Endpoint %s failed", self.path.split("?")[0])
            try:
                self.error(500, "server", "Something went wrong on our side. Please try again, or book on WhatsApp.")
            except Exception:
                pass
    return wrapper
