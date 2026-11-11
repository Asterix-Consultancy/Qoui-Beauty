"""GET /api/slots?service=glam&location=studio&date=2026-12-13

Every start time that day, including the unavailable ones (so the site can show them as taken).
"""

from __future__ import annotations

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib import booking, db  # noqa: E402
from _lib.http import JsonHandler, safe  # noqa: E402

DAY_MESSAGES = {
    "past": "That day has passed.",
    "too_far": "We're not taking bookings that far ahead yet.",
    "blocked": "Betty is away that day.",
    "closed": "The studio is closed that day.",
}


class handler(JsonHandler):
    @safe
    def do_GET(self):
        q = self.query()
        service = db.service_by_code(q.get("service", ""))
        location = q.get("location", "")
        if not service:
            return self.error(400, "service", "Unknown look.")
        if location not in ("studio", "house_call"):
            return self.error(400, "location", "Choose studio or house call.")
        try:
            day = date.fromisoformat(q.get("date", ""))
        except ValueError:
            return self.error(400, "date", "Date must be YYYY-MM-DD.")
        reason, grid = booking.day_grid(day, service, location, booking.rules())
        self.send_json(200, {
            "ok": True,
            "date": day.isoformat(),
            "day_status": reason,
            "message": DAY_MESSAGES.get(reason),
            "slots": [
                {"start_time": s["start"].isoformat(), "label": s["label"], "available": s["available"],
                 "reason": s["reason"]}
                for s in grid
            ],
        })
