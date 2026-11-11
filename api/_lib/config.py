"""Environment config, time helpers and logging."""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo

NAIROBI = ZoneInfo("Africa/Nairobi")

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("qoui")


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        raise RuntimeError(f"Missing environment variable {name}")
    return value


def digits(phone: str) -> str:
    """'+254 727 509 719' -> '254727509719' (WhatsApp ids have no '+')."""
    return re.sub(r"\D", "", phone or "")


def whatsapp_enabled() -> bool:
    """WhatsApp bot + alerts are on hold (moving to qworks). Off unless WHATSAPP_ENABLED=1."""
    return os.environ.get("WHATSAPP_ENABLED") == "1"


def betty_phone() -> str:
    """Where booking alerts go: Admin → Settings → WhatsApp, falling back to BETTY_PHONE."""
    from . import db  # local import to avoid a cycle
    return digits(db.settings().get("alert_whatsapp") or env("BETTY_PHONE"))


def now() -> datetime:
    return datetime.now(NAIROBI)


def to_local(dt: datetime) -> datetime:
    return dt.astimezone(NAIROBI)


def fmt_slot(dt: datetime) -> str:
    """'Sat 13 Dec 10:00' - 16 chars, fits WhatsApp's 20-char button title."""
    d = to_local(dt)
    return f"{d:%a} {d.day} {d:%b %H:%M}"


def fmt_day(dt: datetime) -> str:
    d = to_local(dt)
    return f"{d:%a} {d.day} {d:%b}"


def mask_phone(phone: str) -> str:
    """For logs: 2547****9719."""
    p = digits(phone)
    return p[:4] + "****" + p[-4:] if len(p) > 8 else "****"


def kes(n: int) -> str:
    return f"KES {n:,}"
