"""GET /api/availability?service=glam&location=studio&month=2026-12

Status of every day in the month: available | limited | full | closed | blocked | past | too_far.
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib import booking, db  # noqa: E402
from _lib.http import JsonHandler, safe  # noqa: E402


class handler(JsonHandler):
    @safe
    def do_GET(self):
        q = self.query()
        service = db.service_by_code(q.get("service", ""))
        location = q.get("location", "")
        month = q.get("month", "")
        if not service:
            return self.error(400, "service", "Unknown look.")
        if location not in ("studio", "house_call"):
            return self.error(400, "location", "Choose studio or house call.")
        m = re.fullmatch(r"(\d{4})-(\d{2})", month)
        if not m or not (1 <= int(m.group(2)) <= 12) or not (2024 <= int(m.group(1)) <= 2100):
            return self.error(400, "month", "Month must be YYYY-MM.")
        days = booking.month_overview(int(m.group(1)), int(m.group(2)), service, location, booking.rules())
        self.send_json(200, {"ok": True, "month": month, "days": days}, cache="no-store")
