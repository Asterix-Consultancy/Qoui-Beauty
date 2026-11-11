"""Messages to Betty and to clients that may fall outside the 24-hour window."""

from __future__ import annotations

from . import db
from .config import betty_phone, fmt_slot, kes, log, whatsapp_enabled
from .whatsapp import send_text_or_template


def betty(text: str) -> None:
    """Alert Betty. If she hasn't messaged the bot in 24 h, Meta requires the betty_alert template.
    While WhatsApp is on hold, Betty sees everything in the Admin UI instead."""
    if not whatsapp_enabled():
        return
    try:
        wa_id = send_text_or_template(betty_phone(), text, "betty_alert", [text])
        db.log_outbound(wa_id, None, "betty_alert", text)
    except Exception:
        log.exception("Could not alert Betty")


def client(booking_or_client: dict, phone: str, text: str) -> None:
    """Message a client outside a conversation (after Betty's OK/NO/REPLY)."""
    if not whatsapp_enabled():
        return
    name = booking_or_client.get("client_name") or "there"
    wa_id = send_text_or_template(phone, text, "booking_update", [name, text])
    db.log_outbound(wa_id, booking_or_client.get("client_id"), "text", text)


def booking_line(b: dict) -> str:
    """'Jane, Glam, house call (Umoja), Sat 13 Dec 10:00'"""
    where = f"house call ({b['address']})" if b["location_type"] == "house_call" else "studio"
    return f"{b.get('client_name') or 'No name'}, {b['service_name']}, {where}, {fmt_slot(b['start_at'])}"


def booking_summary(b: dict) -> str:
    where = f"House call at {b['address']}" if b["location_type"] == "house_call" else "At the studio in Donholm"
    return (
        f"{b['service_name']} on {fmt_slot(b['start_at'])}. {where}. "
        f"Total {kes(b['total_kes'])}, deposit {kes(b['deposit_kes'])} received."
    )
