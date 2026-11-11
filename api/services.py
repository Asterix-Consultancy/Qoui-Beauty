"""GET /api/services - price list and booking rules for the website (from the database)."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib import booking, db  # noqa: E402
from _lib.config import now  # noqa: E402
from _lib.http import JsonHandler, safe  # noqa: E402
from datetime import timedelta  # noqa: E402


class handler(JsonHandler):
    @safe
    def do_GET(self):
        r = booking.rules()
        today = now().date()
        self.send_json(200, {
            "ok": True,
            "services": [
                {"code": s["code"], "name": s["name"], "price_kes": s["price_kes"],
                 "duration_min": s["duration_min"], "includes": s["description"]}
                for s in db.services()
            ],
            "house_call_fee_kes": r.house_call_fee,
            "deposit_kes": r.deposit,
            "hold_hours": r.pending_hold_hours,
            "min_date": today.isoformat(),
            "max_date": (today + timedelta(days=r.max_days_ahead)).isoformat(),
            "today": today.isoformat(),
        }, cache="public, max-age=60, s-maxage=60")
