"""Tools the assistant can call. Every price, slot and booking comes from the database here,
never from the model. Each tool returns a JSON-serialisable dict."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from . import booking, db, notify
from .config import betty_phone, fmt_slot, kes, log


@dataclass
class Ctx:
    """Who the assistant is talking to, for this message only."""
    client: dict
    phone: str
    last_message: str
    reply_buttons: list[str] = field(default_factory=list)
    reply_text: str | None = None
    handed_off: bool = False


# ---------------------------------------------------------------- tool schemas (for Claude)

SERVICE_CODES = ["soft_glam", "glam", "bridal"]

TOOL_DEFS = [
    {
        "name": "get_services",
        "description": "Price list, what each look includes, durations, house-call fee and deposit amount. "
                       "Call this before quoting any price, duration or deposit.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "get_free_slots",
        "description": "Up to 3 free start times for a service on a date. Only offer times this returns.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "YYYY-MM-DD, Nairobi date"},
                "service": {"type": "string", "enum": SERVICE_CODES},
                "location_type": {"type": "string", "enum": ["studio", "house_call"]},
            },
            "required": ["date", "service", "location_type"],
            "additionalProperties": False,
        },
    },
    {
        "name": "create_booking",
        "description": "Create a PENDING booking once the client has picked a slot from get_free_slots and given "
                       "their name (and address for house calls). Returns booking id, total and deposit "
                       "instructions. This does NOT confirm the booking - only Betty confirms.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Client's name for the booking"},
                "service": {"type": "string", "enum": SERVICE_CODES},
                "location_type": {"type": "string", "enum": ["studio", "house_call"]},
                "address": {"type": "string", "description": "Area and address for house calls; empty for studio"},
                "start_time": {"type": "string", "description": "ISO start time exactly as returned by get_free_slots"},
            },
            "required": ["name", "service", "location_type", "start_time"],
            "additionalProperties": False,
        },
    },
    {
        "name": "record_deposit_code",
        "description": "Save the M-Pesa confirmation code the client sent for their booking deposit and alert Betty.",
        "input_schema": {
            "type": "object",
            "properties": {
                "booking_id": {"type": "integer"},
                "mpesa_code": {"type": "string", "description": "10 letters/digits, e.g. TKB4XYZ12A"},
            },
            "required": ["booking_id", "mpesa_code"],
            "additionalProperties": False,
        },
    },
    {
        "name": "handoff_to_betty",
        "description": "Pass the conversation to Betty: allergies or skin conditions, complaints, special requests, "
                       "anything not on the price list, changes to a confirmed booking, angry clients, or anything "
                       "you are unsure about.",
        "input_schema": {
            "type": "object",
            "properties": {"reason": {"type": "string", "description": "Short summary for Betty"}},
            "required": ["reason"],
            "additionalProperties": False,
        },
    },
    {
        "name": "reply_with_buttons",
        "description": "Send your reply with up to 3 tappable buttons (each max 20 characters), e.g. time slots "
                       "('Sat 13 Dec 10:00') or choices ('Studio', 'House call'). Call it ALONE as your final step "
                       "instead of writing a plain text reply.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "The message above the buttons, 1-3 short sentences"},
                "buttons": {"type": "array", "items": {"type": "string", "maxLength": 20}, "minItems": 1, "maxItems": 3},
            },
            "required": ["text", "buttons"],
            "additionalProperties": False,
        },
    },
]


# ---------------------------------------------------------------- helpers

def _spread(slots: list[datetime], n: int = 3, gap_min: int = 90) -> list[datetime]:
    """Pick up to n slots spread across the day rather than three back-to-back."""
    picked: list[datetime] = []
    for s in slots:
        if all(abs((s - p).total_seconds()) >= gap_min * 60 for p in picked):
            picked.append(s)
        if len(picked) == n:
            break
    for s in slots:  # fill if the day is tight
        if len(picked) == n:
            break
        if s not in picked:
            picked.append(s)
    return sorted(picked)


# ---------------------------------------------------------------- tools

def get_services(ctx: Ctx, _: dict) -> dict:
    r = booking.rules()
    return {
        "services": [
            {"code": s["code"], "name": s["name"], "price_kes": s["price_kes"], "duration_min": s["duration_min"],
             "includes": s["description"]}
            for s in db.services()
        ],
        "house_call_fee_kes": r.house_call_fee,
        "house_call_note": f"House calls add {kes(r.house_call_fee)} to any service.",
        "deposit_kes": r.deposit,
        "studio": r.studio_address,
        "website_booking": "Clients can also book online at the website's Book page.",
    }


def get_free_slots(ctx: Ctx, args: dict) -> dict:
    service = db.service_by_code(args["service"])
    if not service:
        return {"error": "Unknown service"}
    try:
        day = date.fromisoformat(str(args["date"]).strip()[:10])
    except ValueError:
        return {"error": "Date must be YYYY-MM-DD"}
    reason, grid = booking.day_grid(day, service, args["location_type"], booking.rules())
    notes = {
        "past": "That date is in the past.",
        "too_far": "That date is too far ahead to book yet.",
        "blocked": "Betty is not available that day. Suggest another date.",
        "closed": "The studio is closed that day. Suggest another date.",
    }
    if reason:
        return {"date": str(day), "slots": [], "note": notes[reason]}
    slots = _spread([s["start"] for s in grid if s["available"]])
    if not slots:
        return {"date": str(day), "slots": [], "note": "No free times that day. Suggest another date."}
    return {
        "date": str(day),
        "service": service["name"],
        "location_type": args["location_type"],
        "slots": [{"start_time": s.isoformat(), "label": fmt_slot(s)} for s in slots],
    }


def create_booking(ctx: Ctx, args: dict) -> dict:
    try:
        result = booking.create_pending(
            client_id=ctx.client["id"], name=args.get("name", ""), service_code=args.get("service", ""),
            location_type=args.get("location_type", ""), address=args.get("address"),
            start_time=args.get("start_time", ""), source="whatsapp",
        )
    except booking.BookingError as e:
        hint = {
            "taken": " Call get_free_slots again and offer new times.",
            "too_many": " Hand off to Betty.",
            "name": " Ask the client for their name.",
        }.get(e.code, "")
        return {"error": e.message + hint}
    ctx.client["name"] = args.get("name", "").strip()
    return {k: result[k] for k in ("booking_id", "status", "summary", "total_kes", "deposit_kes",
                                    "deposit_instructions", "hold_note")}


def record_deposit_code(ctx: Ctx, args: dict) -> dict:
    try:
        booking.record_deposit(int(args["booking_id"]), ctx.client["id"], args.get("mpesa_code", ""))
    except booking.BookingError as e:
        extra = " Ask the client to check it." if e.code == "code_format" else " Hand off to Betty."
        return {"error": e.message + extra}
    return {"booking_id": int(args["booking_id"]), "status": "deposit_claimed",
            "next": "Betty will check the payment and confirm here shortly."}


def handoff_to_betty(ctx: Ctx, args: dict) -> dict:
    reason = (args.get("reason") or "Client needs Betty").strip()
    existing = db.open_handoff(ctx.client["id"])
    hid = existing["id"] if existing else db.create_handoff(ctx.client["id"], reason)
    who = ctx.client.get("name") or "New client"
    notify.betty(
        f"Handoff H{hid}: {who} (+{ctx.phone}). {reason}. "
        f"Their message: \"{ctx.last_message[:300]}\". Reply with: REPLY H{hid} your message"
    )
    ctx.handed_off = True
    return {"handoff_id": hid, "told_betty": True,
            "say": "Tell the client Betty will reply shortly. Don't promise a time."}


def reply_with_buttons(ctx: Ctx, args: dict) -> dict:
    ctx.reply_text = (args.get("text") or "").strip()
    ctx.reply_buttons = [b.strip()[:20] for b in args.get("buttons", []) if b and b.strip()][:3]
    return {"sent": True}


TOOLS = {
    "get_services": get_services,
    "get_free_slots": get_free_slots,
    "create_booking": create_booking,
    "record_deposit_code": record_deposit_code,
    "handoff_to_betty": handoff_to_betty,
    "reply_with_buttons": reply_with_buttons,
}


def run(ctx: Ctx, name: str, args: dict) -> tuple[dict, bool]:
    """Returns (result, is_error)."""
    fn = TOOLS.get(name)
    if not fn:
        return {"error": f"Unknown tool {name}"}, True
    try:
        result = fn(ctx, args or {})
        return result, "error" in result
    except (KeyError, TypeError, ValueError) as e:
        log.warning("Tool %s bad input: %s", name, e)
        return {"error": f"Invalid input: {e}"}, True


__all__ = ["Ctx", "TOOL_DEFS", "run", "betty_phone"]
