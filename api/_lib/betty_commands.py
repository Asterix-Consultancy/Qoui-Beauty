"""Commands Betty sends to the bot from her own WhatsApp number."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta

from . import db, notify
from .config import NAIROBI, fmt_day, fmt_slot, log, now

HELP = (
    "Commands:\n"
    "OK 12 - confirm booking 12\n"
    "NO 12 - cancel booking 12\n"
    "TODAY / TOMORROW - list bookings\n"
    "BLOCK 2026-12-24 [reason] - day off\n"
    "UNBLOCK 2026-12-24\n"
    "REPLY 12 message - message the client of booking 12\n"
    "REPLY H5 message - answer handoff 5\n"
    "DONE H5 - close handoff 5"
)


def handle(text: str) -> str:
    """Returns the reply to send back to Betty."""
    msg = (text or "").strip()
    m = re.match(r"^(\w+)\s*(.*)$", msg, re.S)
    if not m:
        return HELP
    cmd, rest = m.group(1).upper(), m.group(2).strip()
    try:
        if cmd in ("OK", "YES"):
            return _ok(rest)
        if cmd == "NO":
            return _no(rest)
        if cmd in ("TODAY", "LEO"):
            return _list(now().date())
        if cmd in ("TOMORROW", "KESHO"):
            return _list(now().date() + timedelta(days=1))
        if cmd == "BLOCK":
            return _block(rest)
        if cmd == "UNBLOCK":
            return _unblock(rest)
        if cmd == "REPLY":
            return _reply(rest)
        if cmd == "DONE":
            return _done(rest)
    except Exception:
        log.exception("Betty command failed: %s", cmd)
        return f"Sorry, '{cmd}' failed on my side. Try again, or check the logs."
    return HELP


def _booking_id(rest: str) -> int | None:
    m = re.match(r"^#?(\d+)\b", rest)
    return int(m.group(1)) if m else None


def _ok(rest: str) -> str:
    bid = _booking_id(rest)
    if bid is None:
        return "Which booking? e.g. OK 12"
    b = db.booking(bid)
    if not b:
        return f"No booking #{bid}."
    if b["status"] == "confirmed":
        return f"#{bid} is already confirmed."
    if b["status"] not in ("pending", "deposit_claimed"):
        return f"#{bid} is {b['status']} and can't be confirmed."
    b = db.set_booking_status(bid, "confirmed", ("pending", "deposit_claimed"))
    if not b:
        return f"#{bid} changed meanwhile, check again."
    summary = notify.booking_summary(b)
    if not b["mpesa_code"]:
        summary = summary.replace(" received.", " (pay on the day as agreed with Betty).")
    text = f"You're booked, {b['client_name'] or 'lovely'}! {summary} Betty will see you then."
    try:
        notify.client(b, b["client_phone"], text)
    except Exception:
        log.exception("Client confirmation failed for booking %s", bid)
        return f"#{bid} confirmed, but the message to the client failed. Please message them directly."
    warn = "" if b["mpesa_code"] else " (no deposit code was sent)"
    return f"#{bid} confirmed{warn}. {b['client_name'] or 'Client'} notified."


def _no(rest: str) -> str:
    bid = _booking_id(rest)
    if bid is None:
        return "Which booking? e.g. NO 12"
    b = db.set_booking_status(bid, "cancelled", ("pending", "deposit_claimed", "confirmed"))
    if not b:
        existing = db.booking(bid)
        return f"No booking #{bid}." if not existing else f"#{bid} is already {existing['status']}."
    text = (f"Hi {b['client_name'] or 'there'}, sorry, Betty can't take your {b['service_name']} booking on "
            f"{fmt_slot(b['start_at'])}. She'll be in touch about your deposit if you sent one. "
            "Reply here to find another time.")
    try:
        notify.client(b, b["client_phone"], text)
    except Exception:
        log.exception("Client cancellation message failed for booking %s", bid)
        return f"#{bid} cancelled, but the message to the client failed. Please message them directly."
    refund = " Remember to refund the deposit." if b["mpesa_code"] else ""
    return f"#{bid} cancelled and client told.{refund}"


def _list(day: date) -> str:
    start = datetime.combine(day, datetime.min.time(), NAIROBI)
    rows = db.bookings_between(start, start + timedelta(days=1))
    blocked = " (BLOCKED)" if db.is_blocked(day) else ""
    if not rows:
        return f"{fmt_day(start)}{blocked}: no bookings."
    lines = [f"{fmt_day(start)}{blocked}:"]
    for b in rows:
        where = f"house call, {b['address']}" if b["location_type"] == "house_call" else "studio"
        lines.append(f"#{b['id']} {b['start_at'].astimezone(NAIROBI):%H:%M} {b['client_name'] or '?'}, "
                     f"{b['service_name']}, {where} [{b['status']}]")
    return "\n".join(lines)


def _parse_day(rest: str) -> tuple[date | None, str]:
    m = re.match(r"^(\d{4}-\d{2}-\d{2})\s*(.*)$", rest, re.S)
    if not m:
        return None, ""
    try:
        return date.fromisoformat(m.group(1)), m.group(2).strip()
    except ValueError:
        return None, ""


def _block(rest: str) -> str:
    day, reason = _parse_day(rest)
    if not day:
        return "Use: BLOCK 2026-12-24 [reason]"
    db.block_day(day, reason or None)
    start = datetime.combine(day, datetime.min.time(), NAIROBI)
    clash = db.bookings_between(start, start + timedelta(days=1))
    note = f" Heads up: {len(clash)} booking(s) already that day - send TODAY/TOMORROW or check." if clash else ""
    return f"{fmt_day(start)} blocked. No new bookings will be offered.{note}"


def _unblock(rest: str) -> str:
    day, _ = _parse_day(rest)
    if not day:
        return "Use: UNBLOCK 2026-12-24"
    ok = db.unblock_day(day)
    return f"{day.isoformat()} is open again." if ok else f"{day.isoformat()} wasn't blocked."


def _reply(rest: str) -> str:
    m = re.match(r"^(H?)#?(\d+)\s+(.+)$", rest, re.S | re.I)
    if not m:
        return "Use: REPLY 12 your message  (or REPLY H5 your message)"
    is_handoff, num, body = bool(m.group(1)), int(m.group(2)), m.group(3).strip()
    if is_handoff:
        h = db.handoff(num)
        if not h:
            return f"No handoff H{num}."
        target = {"client_id": h["client_id"], "client_name": h["client_name"]}
        phone = h["client_phone"]
    else:
        b = db.booking(num)
        if not b:
            return f"No booking #{num}."
        target, phone = b, b["client_phone"]
    try:
        notify.client(target, phone, f"Betty: {body}")
    except Exception:
        log.exception("REPLY failed")
        return "Couldn't deliver that. The client may need to message first; try from your own phone."
    if is_handoff:
        db.resolve_handoff(num)
    return "Sent." + (f" Handoff H{num} closed." if is_handoff else "")


def _done(rest: str) -> str:
    m = re.match(r"^H?#?(\d+)", rest, re.I)
    if not m:
        return "Use: DONE H5"
    return f"Handoff H{m.group(1)} closed." if db.resolve_handoff(int(m.group(1))) else f"No handoff H{m.group(1)}."
