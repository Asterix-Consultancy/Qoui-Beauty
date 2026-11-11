"""/api/admin/settings
GET  -> services, booking rules, payment + studio details, weekly hours, days off
POST {section, ...} -> save one section: services | rules | payment | studio | hours | days_off
"""

from __future__ import annotations

import os
import re
import sys
from datetime import date, time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _lib import db  # noqa: E402
from _lib.admin_auth import AdminHandler, audit  # noqa: E402
from _lib.config import now  # noqa: E402
from _lib.http import safe  # noqa: E402

RULES = {  # key: (label, min, max)
    "deposit_amount": (0, 100000),
    "house_call_fee": (0, 100000),
    "travel_buffer_min": (0, 240),
    "min_lead_min": (0, 7 * 24 * 60),
    "pending_hold_hours": (1, 168),
    "max_days_ahead": (7, 365),
    "slot_step_min": (15, 120),
    "password_max_age_days": (30, 365),
    "session_idle_min": (10, 480),
    "session_max_hours": (1, 24),
}
TEXTS = {"studio_address": 200, "studio_directions": 500, "mpesa_number": 30, "mpesa_name": 60,
         "whatsapp_number": 20, "alert_whatsapp": 20}
PHONE = re.compile(r"^\+?[0-9 ]{9,18}$")


def phone_digits(v: str) -> str:
    """'0727 509 719' / '+254 727 509 719' -> '254727509719'."""
    d = re.sub(r"\D", "", v)
    if d.startswith("0") and len(d) == 10:
        d = "254" + d[1:]
    return d


class BadInput(Exception):
    pass


def _int(v, lo: int, hi: int, what: str) -> int:
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise BadInput(f"{what} must be a number.")
    if not lo <= n <= hi:
        raise BadInput(f"{what} must be between {lo} and {hi}.")
    return n


def _time(v: str, what: str) -> time:
    if not isinstance(v, str) or not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
        raise BadInput(f"{what} must be a time like 09:00.")
    return time.fromisoformat(v)


def snapshot() -> dict:
    s = db.settings()
    hours = db.availability_all()
    return {
        "services": [
            {"code": x["code"], "name": x["name"], "price_kes": x["price_kes"], "duration_min": x["duration_min"],
             "description": x["description"], "active": x["active"]}
            for x in db.services(active_only=False)
        ],
        "rules": {k: db.setting_int(s, k, 0) for k in RULES},
        "texts": {k: s.get(k, "") for k in TEXTS},
        "hours": [
            {"weekday": d, "open": bool(hours.get(d)),
             "start": hours[d][0]["start_time"].strftime("%H:%M") if hours.get(d) else "09:00",
             "end": hours[d][-1]["end_time"].strftime("%H:%M") if hours.get(d) else "18:00"}
            for d in range(7)
        ],
        "days_off": [
            {"day": r["day"].isoformat(), "reason": r["reason"] or ""}
            for r in db.all_("SELECT day, reason FROM blocked_days WHERE day >= %s ORDER BY day", (now().date(),))
        ],
    }


class handler(AdminHandler):
    @safe
    def do_GET(self):
        if not self.require(role="owner"):
            return
        self.send_json(200, {"ok": True, **snapshot()})

    @safe
    def do_POST(self):
        me = self.require(role="owner", post=True)
        if not me:
            return
        data = self.body()
        if not data:
            return self.error(400, "body", "Nothing to save.")
        try:
            self.save(data.get("section"), data)
        except BadInput as e:
            return self.error(400, "invalid", str(e))
        audit(me["id"], "settings_saved", str(data.get("section")), self.ip_h())
        self.send_json(200, {"ok": True, **snapshot()})

    def save(self, section: str, data: dict) -> None:
        if section == "services":
            items = data.get("services")
            if not isinstance(items, list) or not items:
                raise BadInput("No services sent.")
            with db.tx() as c:
                for it in items:
                    code = str(it.get("code", ""))
                    if not db.service_by_code(code) and not c.execute("SELECT 1 FROM services WHERE code=%s", (code,)).fetchone():
                        raise BadInput("Unknown service.")
                    name = str(it.get("name", "")).strip()
                    if not 2 <= len(name) <= 40:
                        raise BadInput("Each look needs a name.")
                    c.execute(
                        "UPDATE services SET name=%s, price_kes=%s, duration_min=%s, description=%s, active=%s WHERE code=%s",
                        (name, _int(it.get("price_kes"), 0, 200000, f"{name} price"),
                         _int(it.get("duration_min"), 15, 600, f"{name} duration"),
                         str(it.get("description", "")).strip()[:400], bool(it.get("active", True)), code),
                    )
        elif section == "rules":
            vals = data.get("rules") or {}
            with db.tx() as c:
                for k, (lo, hi) in RULES.items():
                    if k in vals:
                        c.execute("INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                                  (k, str(_int(vals[k], lo, hi, k.replace("_", " ")))))
        elif section in ("payment", "studio", "whatsapp"):
            vals = data.get("texts") or {}
            keys = {"payment": ("mpesa_number", "mpesa_name"), "studio": ("studio_address", "studio_directions"),
                    "whatsapp": ("whatsapp_number", "alert_whatsapp")}[section]
            with db.tx() as c:
                for k in keys:
                    if k in vals:
                        v = str(vals[k]).strip()[:TEXTS[k]]
                        if k == "mpesa_number" and v and not re.fullmatch(r"[0-9 +]{9,16}", v):
                            raise BadInput("M-Pesa number should look like 0712 345 678.")
                        if k in ("whatsapp_number", "alert_whatsapp") and v:
                            if not PHONE.match(v) or not 11 <= len(phone_digits(v)) <= 15:
                                raise BadInput("WhatsApp numbers should look like 0727 509 719 or +254 727 509 719.")
                            v = phone_digits(v)
                        if k == "whatsapp_number" and not v:
                            raise BadInput("The studio WhatsApp number can't be empty.")
                        c.execute("INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (k, v))
        elif section == "hours":
            days = data.get("hours")
            if not isinstance(days, list) or len(days) != 7:
                raise BadInput("Send all 7 days.")
            rows = []
            for d in days:
                wd = _int(d.get("weekday"), 0, 6, "weekday")
                if d.get("open"):
                    a, b = _time(d.get("start"), "Opening time"), _time(d.get("end"), "Closing time")
                    if b <= a:
                        raise BadInput("Closing time must be after opening time.")
                    rows.append((wd, a, b))
            if not rows:
                raise BadInput("Keep at least one day open.")
            with db.tx() as c:
                c.execute("DELETE FROM availability")
                for r in rows:
                    c.execute("INSERT INTO availability (weekday, start_time, end_time) VALUES (%s, %s, %s)", r)
        elif section == "days_off":
            op = data.get("op")
            try:
                day = date.fromisoformat(str(data.get("day", "")))
            except ValueError:
                raise BadInput("Pick a date.")
            if op == "add":
                if day < now().date():
                    raise BadInput("That date has passed.")
                db.block_day(day, str(data.get("reason", "")).strip()[:100] or None)
            elif op == "remove":
                db.unblock_day(day)
            else:
                raise BadInput("Unknown action.")
        else:
            raise BadInput("Unknown section.")
