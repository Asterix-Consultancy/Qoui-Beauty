"""GET /api/cron/reminders - run daily by Vercel Cron (see vercel.json).

Also releases expired unpaid holds and applies the data-retention rules on the privacy page.

Sends the approved `appointment_reminder` template for every CONFIRMED booking tomorrow
(Nairobi time) that hasn't had one, and releases unpaid PENDING holds that expired.
Vercel sends `Authorization: Bearer $CRON_SECRET`.
"""

from __future__ import annotations

import hmac
import json
import os
import sys
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _lib import db, notify  # noqa: E402
from _lib import whatsapp as wa  # noqa: E402
from _lib.config import NAIROBI, log, now, whatsapp_enabled  # noqa: E402


def purge() -> dict:
    """Retention promised on the privacy page: notes/messages 12 months, booking records 5 years."""
    with db.tx() as c:
        notes = c.execute(
            "UPDATE bookings SET notes = NULL WHERE notes IS NOT NULL AND end_at < now() - interval '12 months'"
        ).rowcount
        msgs = c.execute(
            """DELETE FROM messages m WHERE m.created_at < now() - interval '12 months'
               AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.client_id = m.client_id
                               AND b.end_at > now() - interval '12 months')"""
        ).rowcount
        old = c.execute("DELETE FROM bookings WHERE end_at < now() - interval '5 years'").rowcount
        c.execute(
            """DELETE FROM clients cl WHERE created_at < now() - interval '12 months'
               AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.client_id = cl.id)
               AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.client_id = cl.id)"""
        )
    return {"notes_cleared": notes, "messages_deleted": msgs, "bookings_deleted": old}


def run() -> dict:
    s = db.settings()
    expired = db.expire_stale_pending(db.setting_int(s, "pending_hold_hours", 12))
    purged = purge()

    tomorrow = now().date() + timedelta(days=1)
    if not whatsapp_enabled():  # reminders resume when the WhatsApp side is switched on
        return {"date": tomorrow.isoformat(), "sent": 0, "failed": 0, "expired_pending": expired, "whatsapp": "off", **purged}
    start = datetime.combine(tomorrow, datetime.min.time(), NAIROBI)
    sent, failed = 0, 0
    for b in db.bookings_between(start, start + timedelta(days=1), ("confirmed",)):
        if b["reminder_sent_at"]:
            continue
        place = b["address"] if b["location_type"] == "house_call" else s.get("studio_address", "the studio in Donholm")
        params = [
            b["client_name"] or "there",
            b["service_name"],
            f"{b['start_at'].astimezone(NAIROBI):%H:%M}",
            place,
            b["prep_tip"] or "Come with a clean, moisturised face.",
        ]
        try:
            wa_id = wa.send_template(b["client_phone"], "appointment_reminder", params)
            db.one("UPDATE bookings SET reminder_sent_at = now() WHERE id = %s RETURNING id", (b["id"],))
            db.log_outbound(wa_id, b["client_id"], "template", "Reminder: " + " | ".join(params))
            sent += 1
        except Exception:
            log.exception("Reminder failed for booking %s", b["id"])
            failed += 1

    if failed:
        notify.betty(f"{failed} reminder(s) for tomorrow failed to send. Send TOMORROW to see the list.")
    return {"date": tomorrow.isoformat(), "sent": sent, "failed": failed, "expired_pending": expired, **purged}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        secret = os.environ.get("CRON_SECRET", "")
        auth = self.headers.get("Authorization", "")
        if not secret or not hmac.compare_digest(auth, f"Bearer {secret}"):
            self._send(401, {"error": "unauthorized"})
            return
        try:
            self._send(200, run())
        except Exception:
            log.exception("Reminder cron failed")
            self._send(500, {"error": "failed"})

    def _send(self, status: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass
