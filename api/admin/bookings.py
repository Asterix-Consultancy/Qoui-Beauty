"""/api/admin/bookings
GET  ?view=action|upcoming|today|past  -> bookings for Betty
POST {id, action: confirm|cancel|complete|no_show} -> change status
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _lib import db, notify  # noqa: E402
from _lib.admin_auth import AdminHandler, audit  # noqa: E402
from _lib.config import NAIROBI, fmt_slot, kes, now, whatsapp_enabled  # noqa: E402
from _lib.http import safe  # noqa: E402

VIEWS = {
    "action": ("b.status IN ('pending','deposit_claimed') AND b.start_at > now() - interval '1 day'", "b.start_at ASC"),
    "upcoming": ("b.status = 'confirmed' AND b.start_at >= now() - interval '3 hours'", "b.start_at ASC"),
    "today": ("b.start_at >= %(d0)s AND b.start_at < %(d1)s AND b.status <> 'cancelled'", "b.start_at ASC"),
    "past": ("(b.start_at < now() - interval '3 hours' OR b.status IN ('cancelled','completed','no_show'))", "b.start_at DESC"),
}

TRANSITIONS = {
    "confirm": ("confirmed", ("pending", "deposit_claimed")),
    "cancel": ("cancelled", ("pending", "deposit_claimed", "confirmed")),
    "complete": ("completed", ("confirmed",)),
    "no_show": ("no_show", ("confirmed",)),
}


def client_message(b: dict, action: str) -> str:
    first = (b.get("client_name") or "").split(" ")[0] or "there"
    where = f"house call at {b['address']}" if b["location_type"] == "house_call" else "the studio in Donholm"
    if action == "confirm":
        return (f"Hi {first}, your {b['service_name']} on {fmt_slot(b['start_at'])} at {where} is confirmed. "
                f"Total {kes(b['total_kes'])}, deposit received. See you then! – Betty, Qoui Glam Studio")
    return (f"Hi {first}, sorry, I can't take your {b['service_name']} booking on {fmt_slot(b['start_at'])}. "
            "I'll sort out your deposit if you sent one. Reply here to find another time. – Betty, Qoui Glam Studio")


def shape(b: dict) -> dict:
    return {
        "id": b["id"], "status": b["status"], "source": b.get("source"),
        "service": b["service_name"], "service_code": b["service_code"],
        "client_name": b["client_name"], "client_phone": b["client_phone"],
        "location_type": b["location_type"], "address": b["address"], "notes": b.get("notes"),
        "start_at": b["start_at"].isoformat(), "label": fmt_slot(b["start_at"]),
        "total_kes": b["total_kes"], "deposit_kes": b["deposit_kes"], "mpesa_code": b["mpesa_code"],
        "created_at": b["created_at"].isoformat(),
    }


class handler(AdminHandler):
    @safe
    def do_GET(self):
        if not self.require():
            return
        view = self.query().get("view", "action")
        if view not in VIEWS:
            return self.error(400, "view", "Unknown view.")
        where, order = VIEWS[view]
        d0 = datetime.combine(now().date(), datetime.min.time(), NAIROBI)
        rows = db.all_(db.BOOKING_SELECT + f" WHERE {where} ORDER BY {order} LIMIT 200",
                       {"d0": d0, "d1": d0 + timedelta(days=1)})
        counts = db.one(
            """SELECT count(*) FILTER (WHERE status IN ('pending','deposit_claimed') AND start_at > now() - interval '1 day') AS action,
                      count(*) FILTER (WHERE status = 'deposit_claimed' AND start_at > now() - interval '1 day') AS paid
               FROM bookings"""
        )
        self.send_json(200, {"ok": True, "view": view, "bookings": [shape(b) for b in rows],
                             "counts": {"action": counts["action"], "paid": counts["paid"]}})

    @safe
    def do_POST(self):
        me = self.require(post=True)
        if not me:
            return
        data = self.body() or {}
        action = data.get("action")
        if action not in TRANSITIONS:
            return self.error(400, "action", "Unknown action.")
        try:
            bid = int(data.get("id"))
        except (TypeError, ValueError):
            return self.error(400, "id", "Missing booking.")
        new_status, allowed = TRANSITIONS[action]
        b = db.set_booking_status(bid, new_status, allowed)
        if not b:
            current = db.booking(bid)
            msg = "That booking doesn't exist." if not current else f"Booking #{bid} is already {current['status'].replace('_', ' ')}."
            return self.error(409, "status", msg)

        audit(me["id"], f"booking_{action}", f"#{bid}", self.ip_h())
        wa_link = None
        if action in ("confirm", "cancel"):
            text = client_message(b, action)
            if whatsapp_enabled():
                try:
                    notify.client(b, b["client_phone"], text)
                except Exception:
                    wa_link = f"https://wa.me/{b['client_phone']}?text={quote(text)}"
            else:
                # Direct mode: Betty sends the message herself with one tap.
                wa_link = f"https://wa.me/{b['client_phone']}?text={quote(text)}"
        self.send_json(200, {"ok": True, "booking": shape(b), "whatsapp_link": wa_link})
