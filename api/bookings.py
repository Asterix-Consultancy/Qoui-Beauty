"""POST /api/bookings - create a PENDING booking from the website.

Body: {service, location_type, address?, start_time, name, phone, notes?, consent: true, company: ""}
`company` is a honeypot field humans never see; bots fill it in.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib import booking, db, notify  # noqa: E402
from _lib.config import log, mask_phone  # noqa: E402
from _lib.http import JsonHandler, ip_hash, new_token, normalise_phone, safe  # noqa: E402

MAX_PER_IP_PER_HOUR = 5


class handler(JsonHandler):
    def do_GET(self):
        self.error(405, "method", "Use POST.")

    @safe
    def do_POST(self):
        if not self.same_origin():
            return self.error(403, "origin", "Please book from the Qoui website.")
        data = self.body()
        if data is None:
            return self.error(400, "body", "Something was wrong with that request. Please try again.")

        if (data.get("company") or "").strip():  # honeypot: pretend success, store nothing
            log.info("Honeypot booking ignored")
            return self.send_json(200, {"ok": True, "booking": {"booking_id": 0, "status": "pending"}})

        if data.get("consent") is not True:
            return self.error(400, "consent", "Please agree to us using your details for this booking.")
        phone = normalise_phone(data.get("phone", ""))
        if not phone:
            return self.error(400, "phone", "Please enter a valid phone number, e.g. 0712 345 678.")

        h = ip_hash(self.client_ip())
        recent = db.one(
            "SELECT count(*) AS n FROM bookings WHERE client_ip_hash = %s AND created_at > now() - interval '1 hour'",
            (h,),
        )
        if recent and recent["n"] >= MAX_PER_IP_PER_HOUR:
            return self.error(429, "rate", "That's a lot of bookings in a short time. Please message us on WhatsApp.")

        client, _ = db.get_or_create_client(phone)
        token, token_h = new_token()
        try:
            result = booking.create_pending(
                client_id=client["id"], name=data.get("name", ""), service_code=data.get("service", ""),
                location_type=data.get("location_type", ""), address=data.get("address"),
                start_time=data.get("start_time", ""), notes=data.get("notes"), source="web",
                ip_hash=h, token_hash=token_h,
            )
        except booking.BookingError as e:
            status = 409 if e.code == "taken" else 400
            return self.error(status, e.code, e.message)

        b = db.booking(result["booking_id"])
        notify.betty(
            f"New web booking #{b['id']} (waiting for deposit): {notify.booking_line(b)}, +{phone}."
            + (f" Notes: {b['notes']}." if b.get("notes") else "")
            + f" Reply NO {b['id']} to cancel."
        )
        log.info("Web booking #%s created for %s", b["id"], mask_phone(phone))
        self.send_json(201, {"ok": True, "booking": {**result, "token": token}})
