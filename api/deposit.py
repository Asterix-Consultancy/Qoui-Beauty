"""POST /api/deposit - the website sends the M-Pesa code for a booking it just made.

Body: {booking_id, token, mpesa_code}. The token was returned when the booking was created and
only its hash is stored, so nobody else can attach codes to someone's booking.
"""

from __future__ import annotations

import hmac
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib import booking, db  # noqa: E402
from _lib.http import JsonHandler, safe, token_hash  # noqa: E402


class handler(JsonHandler):
    def do_GET(self):
        self.error(405, "method", "Use POST.")

    @safe
    def do_POST(self):
        if not self.same_origin():
            return self.error(403, "origin", "Please use the Qoui website.")
        data = self.body()
        if data is None:
            return self.error(400, "body", "Something was wrong with that request.")
        try:
            booking_id = int(data.get("booking_id"))
        except (TypeError, ValueError):
            return self.error(400, "booking", "Missing booking number.")
        b = db.booking(booking_id)
        expected = (b or {}).get("web_token_hash")
        if not b or not expected or not hmac.compare_digest(expected, token_hash(data.get("token", ""))):
            return self.error(404, "not_found", "We couldn't find that booking. Send your code on WhatsApp instead.")
        try:
            result = booking.record_deposit(booking_id, b["client_id"], data.get("mpesa_code", ""))
        except booking.BookingError as e:
            return self.error(400, e.code, e.message)
        self.send_json(200, {"ok": True, **result})
