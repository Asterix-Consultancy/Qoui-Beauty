"""Booking rules shared by the WhatsApp assistant and the website booking flow.

One place decides which times are free, so both channels always agree.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from calendar import monthrange

import psycopg

from . import db
from .config import NAIROBI, fmt_slot, kes, now

MAX_ACTIVE_BOOKINGS_PER_CLIENT = 3


class BookingError(Exception):
    """A rule stopped the booking. `code` is machine-readable, `message` is safe to show."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class Rules:
    house_call_fee: int
    travel_buffer_min: int
    deposit: int
    slot_step_min: int
    min_lead_min: int
    max_days_ahead: int
    pending_hold_hours: int
    studio_address: str
    studio_directions: str
    mpesa_number: str
    mpesa_name: str


def rules() -> Rules:
    s = db.settings()
    deposit = os.environ.get("DEPOSIT_AMOUNT") or s.get("deposit_amount") or "0"
    return Rules(
        house_call_fee=db.setting_int(s, "house_call_fee", 1500),
        travel_buffer_min=db.setting_int(s, "travel_buffer_min", 60),
        deposit=int(deposit),
        slot_step_min=max(15, db.setting_int(s, "slot_step_min", 30)),
        min_lead_min=db.setting_int(s, "min_lead_min", 120),
        max_days_ahead=db.setting_int(s, "max_days_ahead", 120),
        pending_hold_hours=db.setting_int(s, "pending_hold_hours", 12),
        studio_address=s.get("studio_address") or "Qoui Glam Studio, Donholm, Nairobi",
        studio_directions=s.get("studio_directions", ""),
        # Set by Betty in Admin → Settings; env vars are only a fallback.
        mpesa_number=s.get("mpesa_number") or os.environ.get("BETTY_MPESA_NUMBER", ""),
        mpesa_name=s.get("mpesa_name") or os.environ.get("BETTY_MPESA_NAME", ""),
    )


def _overlaps(a0: datetime, a1: datetime, ranges: list[tuple[datetime, datetime]]) -> bool:
    return any(a0 < b1 and b0 < a1 for b0, b1 in ranges)


def _buffer(location_type: str, r: Rules) -> timedelta:
    return timedelta(minutes=r.travel_buffer_min if location_type == "house_call" else 0)


def day_status(day: date, r: Rules, blocked: set[date], hours: dict[int, list[dict]]) -> str | None:
    """Why a whole day is unavailable, or None if it can have slots."""
    today = now().date()
    if day < today:
        return "past"
    if day > today + timedelta(days=r.max_days_ahead):
        return "too_far"
    if day in blocked:
        return "blocked"
    if not hours.get(day.weekday()):
        return "closed"
    return None


def day_grid(day: date, service: dict, location_type: str, r: Rules,
             busy: list[tuple[datetime, datetime]] | None = None,
             blocked: set[date] | None = None,
             hours: dict[int, list[dict]] | None = None) -> tuple[str | None, list[dict]]:
    """Every bookable start time on `day`, with availability.

    Returns (day_reason, slots). Each slot: {start, label, available, reason} where reason is
    None, "taken" (overlaps a booking or travel time) or "too_soon" (inside the minimum notice).
    """
    if blocked is None:
        blocked = {day} if db.is_blocked(day) else set()
    if hours is None:
        hours = db.availability_all()
    reason = day_status(day, r, blocked, hours)
    if reason:
        return reason, []
    if busy is None:
        busy = db.busy_ranges(day, r.pending_hold_hours)

    duration = timedelta(minutes=service["duration_min"])
    buf = _buffer(location_type, r)
    step = timedelta(minutes=r.slot_step_min)
    earliest = now() + timedelta(minutes=r.min_lead_min)

    slots: list[dict] = []
    for w in hours.get(day.weekday(), []):
        open_at = datetime.combine(day, w["start_time"], NAIROBI)
        close_at = datetime.combine(day, w["end_time"], NAIROBI)
        t = open_at + buf  # travel happens inside working hours
        while t + duration + buf <= close_at:
            why = None
            if t < earliest:
                why = "too_soon"
            elif _overlaps(t - buf, t + duration + buf, busy):
                why = "taken"
            slots.append({"start": t, "label": f"{t:%H:%M}", "available": why is None, "reason": why})
            t += step
    return None, slots


def free_starts(day: date, service: dict, location_type: str, r: Rules) -> list[datetime]:
    _, slots = day_grid(day, service, location_type, r)
    return [s["start"] for s in slots if s["available"]]


def month_overview(year: int, month: int, service: dict, location_type: str, r: Rules) -> list[dict]:
    """Status of every day in a month, with 3 queries in total."""
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    start = datetime.combine(first, datetime.min.time(), NAIROBI) - timedelta(hours=12)
    end = datetime.combine(last, datetime.min.time(), NAIROBI) + timedelta(hours=36)
    busy = db.busy_ranges_between(start, end, r.pending_hold_hours)
    blocked = db.blocked_days_between(first, last)
    hours = db.availability_all()

    out = []
    d = first
    while d <= last:
        reason, slots = day_grid(d, service, location_type, r, busy, blocked, hours)
        free = sum(1 for s in slots if s["available"])
        if reason:
            status = reason
        elif free == 0:
            status = "full"
        elif free <= 3:
            status = "limited"
        else:
            status = "available"
        out.append({"date": d.isoformat(), "status": status, "free": free})
        d += timedelta(days=1)
    return out


def parse_start(value: str) -> datetime:
    dt = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    return dt.replace(tzinfo=NAIROBI) if dt.tzinfo is None else dt.astimezone(NAIROBI)


def create_pending(*, client_id: int, name: str, service_code: str, location_type: str, address: str | None,
                   start_time: str, notes: str | None = None, source: str = "whatsapp",
                   ip_hash: str | None = None, token_hash: str | None = None) -> dict:
    """Validate and create a PENDING booking. Raises BookingError with a client-safe message."""
    name = (name or "").strip()
    if len(name) < 2 or len(name) > 80:
        raise BookingError("name", "Please enter your name.")
    service = db.service_by_code(service_code)
    if not service:
        raise BookingError("service", "Please choose a look.")
    if location_type not in ("studio", "house_call"):
        raise BookingError("location", "Please choose studio or house call.")
    address = (address or "").strip()[:300]
    if location_type == "house_call" and len(address) < 3:
        raise BookingError("address", "House calls need your area and address.")
    try:
        start = parse_start(start_time)
    except (TypeError, ValueError):
        raise BookingError("time", "Please pick a time.")

    if len(db.client_upcoming_bookings(client_id)) >= MAX_ACTIVE_BOOKINGS_PER_CLIENT:
        raise BookingError("too_many", "You already have a few open bookings. Message us on WhatsApp and Betty will help.")

    r = rules()
    if start not in free_starts(start.date(), service, location_type, r):
        raise BookingError("taken", "Sorry, that time was just taken. Please pick another.")

    buf = _buffer(location_type, r)
    end = start + timedelta(minutes=service["duration_min"])
    total = service["price_kes"] + (r.house_call_fee if location_type == "house_call" else 0)

    try:
        with db.tx() as c:
            # Unpaid holds past their expiry give way to a new booking.
            c.execute(
                """UPDATE bookings SET status = 'cancelled'
                   WHERE status = 'pending' AND created_at < now() - make_interval(hours => %s)
                     AND tstzrange(busy_from, busy_to, '[)') && tstzrange(%s, %s, '[)')""",
                (r.pending_hold_hours, start - buf, end + buf),
            )
            row = c.execute(
                """INSERT INTO bookings (client_id, service_id, location_type, address, start_at, end_at,
                                         busy_from, busy_to, total_kes, deposit_kes, source, notes,
                                         client_ip_hash, web_token_hash)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (client_id, service["id"], location_type, address or None, start, end, start - buf, end + buf,
                 total, r.deposit, source, (notes or "").strip()[:500] or None, ip_hash, token_hash),
            ).fetchone()
            c.execute("UPDATE clients SET name = %s WHERE id = %s", (name[:80], client_id))
    except psycopg.errors.ExclusionViolation:
        raise BookingError("taken", "Sorry, that time was just taken. Please pick another.")

    mpesa_no = r.mpesa_number or "(ask Betty for the M-Pesa number)"
    mpesa_name = r.mpesa_name or "Qoui Glam Studio"
    return {
        "booking_id": row["id"],
        "status": "pending",
        "service": service["name"],
        "service_code": service["code"],
        "location_type": location_type,
        "address": address or None,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "label": fmt_slot(start),
        "summary": f"{service['name']}, {fmt_slot(start)}, "
                   + (f"house call ({address})" if location_type == "house_call" else "studio"),
        "total_kes": total,
        "deposit_kes": r.deposit,
        "mpesa_number": mpesa_no,
        "mpesa_name": mpesa_name,
        "deposit_instructions": f"To hold your slot, send {kes(r.deposit)} to {mpesa_no} ({mpesa_name}) "
                                f"and reply with the M-Pesa confirmation code.",
        "hold_hours": r.pending_hold_hours,
        "studio_address": r.studio_address,
        "studio_directions": r.studio_directions if location_type == "studio" else "",
        "hold_note": f"The slot is held for {r.pending_hold_hours} hours while we wait for the deposit.",
    }


MPESA_CODE_LEN = 10


def normalise_mpesa(code: str) -> str:
    return "".join(str(code or "").split()).upper()


def record_deposit(booking_id: int, client_id: int, code: str) -> dict:
    """Save an M-Pesa code against a booking and alert Betty. Raises BookingError."""
    import re
    from . import notify  # local import: notify imports db only

    code = normalise_mpesa(code)
    if not re.fullmatch(r"[A-Z0-9]{10}", code):
        raise BookingError("code_format", "M-Pesa codes are 10 letters and numbers, e.g. TKB4XYZ12A.")
    b = db.booking(booking_id)
    if not b or b["client_id"] != client_id:
        raise BookingError("not_found", "We couldn't find that booking.")
    if b["status"] not in ("pending", "deposit_claimed"):
        raise BookingError("status", f"This booking is {b['status'].replace('_', ' ')}. Message us on WhatsApp.")
    try:
        updated = db.one(
            """UPDATE bookings SET mpesa_code = %s, status = 'deposit_claimed'
               WHERE id = %s AND status IN ('pending','deposit_claimed') RETURNING id""",
            (code, booking_id),
        )
    except psycopg.errors.UniqueViolation:
        raise BookingError("code_used", "That M-Pesa code was already used for another booking.")
    if not updated:
        raise BookingError("status", "This booking just changed. Message us on WhatsApp.")
    b = db.booking(booking_id)
    notify.betty(
        f"New booking #{b['id']}: {notify.booking_line(b)}, deposit code {code}. "
        f"Reply OK {b['id']} or NO {b['id']}."
    )
    return {"booking_id": b["id"], "status": "deposit_claimed", "mpesa_code": code}
