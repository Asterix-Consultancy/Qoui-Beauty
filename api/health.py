"""GET /api/health - simple status check (no secrets, no personal data)."""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

REQUIRED = ["DATABASE_URL", "APP_ENCRYPTION_KEY", "CRON_SECRET"]
REQUIRED_WHATSAPP = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET",
                     "ANTHROPIC_API_KEY", "CLAUDE_MODEL", "BETTY_PHONE"]


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        needed = REQUIRED + (REQUIRED_WHATSAPP if os.environ.get("WHATSAPP_ENABLED") == "1" else [])
        missing = [k for k in needed if not os.environ.get(k)]
        db_ok = False
        try:
            from _lib import db
            db_ok = db.ping()
        except Exception:
            db_ok = False
        ok = db_ok and not missing
        body = json.dumps({"ok": ok, "database": db_ok, "missing_env_count": len(missing)}).encode()
        self.send_response(200 if ok else 503)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
