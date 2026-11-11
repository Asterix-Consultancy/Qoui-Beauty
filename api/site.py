"""GET /api/site - everything the public website shows that Betty can change in Admin:
prices, durations, opening hours, studio details and visible testimonials. Short cache, so edits
appear on the site within about a minute without redeploying."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib import booking, db  # noqa: E402
from _lib.http import JsonHandler, safe  # noqa: E402


class handler(JsonHandler):
    @safe
    def do_GET(self):
        r = booking.rules()
        hours = db.availability_all()
        self.send_json(200, {
            "ok": True,
            "services": [
                {"code": s["code"], "name": s["name"], "price_kes": s["price_kes"], "duration_min": s["duration_min"]}
                for s in db.services()
            ],
            "house_call_fee_kes": r.house_call_fee,
            "deposit_kes": r.deposit,
            # 0 = Sunday ... 6 = Saturday (matches JavaScript's getDay())
            "hours": {
                str((wd + 1) % 7): [hours[wd][0]["start_time"].strftime("%H:%M"), hours[wd][-1]["end_time"].strftime("%H:%M")]
                if hours.get(wd) else None
                for wd in range(7)
            },
            "studio_address": r.studio_address,
            "whatsapp_number": (db.settings().get("whatsapp_number") or "254727509719"),
            "testimonials": [
                {"quote": t["quote"], "name": t["name"], "service": t["service"]}
                for t in db.all_("SELECT quote, name, service FROM testimonials WHERE visible ORDER BY sort, id LIMIT 12")
            ],
        }, cache="public, max-age=30, s-maxage=60, stale-while-revalidate=300")
