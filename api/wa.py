"""GET /api/wa?text=... -> redirect to WhatsApp chat with the studio's current number (Admin → Settings).

Every WhatsApp button on the site points here, so changing the number in Admin updates the whole
site instantly, including static pages, without a redeploy.
"""

from __future__ import annotations

import os
import re
import sys
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib import db  # noqa: E402
from _lib.http import JsonHandler, safe  # noqa: E402

FALLBACK = "254727509719"


class handler(JsonHandler):
    @safe
    def do_GET(self):
        number = re.sub(r"\D", "", db.settings().get("whatsapp_number") or "") or FALLBACK
        text = (self.query().get("text") or "")[:500]
        url = f"https://wa.me/{number}" + (f"?text={quote(text)}" if text else "")
        self.send_response(302)
        self.send_header("Location", url)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Length", "0")
        self.end_headers()
