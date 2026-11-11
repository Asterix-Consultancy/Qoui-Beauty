"""PostgreSQL access (psycopg 3 + a small pool that survives warm serverless invocations).

Use a POOLED connection string (Neon "-pooler" host or Supabase port 6543). Prepared
statements are disabled so it works behind PgBouncer in transaction mode.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime, timedelta
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import NAIROBI, env

_pool: ConnectionPool | None = None

ACTIVE = ("pending", "deposit_claimed", "confirmed")


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=env("DATABASE_URL"),
            min_size=0,
            max_size=3,
            timeout=10,
            max_idle=60,
            check=ConnectionPool.check_connection,  # drop connections killed while the function was frozen
            kwargs={"row_factory": dict_row, "prepare_threshold": None, "autocommit": True, "connect_timeout": 8},
            open=True,
        )
    return _pool


@contextmanager
def tx() -> Iterator[psycopg.Connection]:
    """One transaction: commits on success, rolls back on any exception."""
    with pool().connection() as conn:
        with conn.transaction():
            yield conn


def one(sql: str, params: Any = None) -> dict | None:
    with tx() as c:
        return c.execute(sql, params).fetchone()


def all_(sql: str, params: Any = None) -> list[dict]:
    with tx() as c:
        return c.execute(sql, params).fetchall()


def ping() -> bool:
    return one("SELECT 1 AS ok") is not None


# ---------------------------------------------------------------- settings / services

def settings() -> dict[str, str]:
    return {r["key"]: r["value"] for r in all_("SELECT key, value FROM settings")}


def setting_int(s: dict[str, str], key: str, default: int) -> int:
    try:
        return int(s.get(key, default))
    except (TypeError, ValueError):
        return default


def services(active_only: bool = True) -> list[dict]:
    sql = "SELECT * FROM services" + (" WHERE active" if active_only else "") + " ORDER BY price_kes"
    return all_(sql)


def service_by_code(code: str) -> dict | None:
    return one("SELECT * FROM services WHERE code = %s AND active", (code,))


def availability_for(weekday: int) -> list[dict]:
    return all_("SELECT start_time, end_time FROM availability WHERE weekday = %s ORDER BY start_time", (weekday,))


def is_blocked(day: date) -> bool:
    return one("SELECT 1 FROM blocked_days WHERE day = %s", (day,)) is not None


def availability_all() -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {}
    for r in all_("SELECT weekday, start_time, end_time FROM availability ORDER BY weekday, start_time"):
        out.setdefault(r["weekday"], []).append(r)
    return out


def blocked_days_between(first: date, last: date) -> set[date]:
    return {r["day"] for r in all_("SELECT day FROM blocked_days WHERE day BETWEEN %s AND %s", (first, last))}


def busy_ranges(day: date, pending_hold_hours: int) -> list[tuple[datetime, datetime]]:
    """Busy windows touching `day` (Nairobi). Stale unpaid PENDING bookings don't count."""
    start = datetime.combine(day, datetime.min.time(), NAIROBI) - timedelta(hours=12)
    return busy_ranges_between(start, start + timedelta(hours=48), pending_hold_hours)


def busy_ranges_between(start: datetime, end: datetime, pending_hold_hours: int) -> list[tuple[datetime, datetime]]:
    rows = all_(
        """
        SELECT busy_from, busy_to FROM bookings
        WHERE busy_to > %s AND busy_from < %s
          AND (status IN ('deposit_claimed', 'confirmed')
               OR (status = 'pending' AND created_at > now() - make_interval(hours => %s)))
        """,
        (start, end, pending_hold_hours),
    )
    return [(r["busy_from"], r["busy_to"]) for r in rows]


# ---------------------------------------------------------------- clients / messages

def get_or_create_client(phone: str) -> tuple[dict, bool]:
    with tx() as c:
        row = c.execute(
            "INSERT INTO clients (phone) VALUES (%s) ON CONFLICT (phone) DO NOTHING RETURNING *", (phone,)
        ).fetchone()
        if row:
            return row, True
        return c.execute("SELECT * FROM clients WHERE phone = %s", (phone,)).fetchone(), False


def client_by_id(client_id: int) -> dict | None:
    return one("SELECT * FROM clients WHERE id = %s", (client_id,))


def set_client_name(client_id: int, name: str) -> None:
    one("UPDATE clients SET name = %s WHERE id = %s RETURNING id", (name.strip()[:80], client_id))


def claim_inbound(wa_message_id: str, client_id: int | None, mtype: str, body: str | None) -> bool:
    """Insert the inbound message. False = already seen (Meta retry) -> skip it."""
    row = one(
        """INSERT INTO messages (wa_message_id, client_id, direction, type, body)
           VALUES (%s, %s, 'in', %s, %s) ON CONFLICT (wa_message_id) DO NOTHING RETURNING id""",
        (wa_message_id, client_id, mtype, body),
    )
    return row is not None


def log_outbound(wa_message_id: str | None, client_id: int | None, mtype: str, body: str) -> None:
    one(
        """INSERT INTO messages (wa_message_id, client_id, direction, type, body)
           VALUES (%s, %s, 'out', %s, %s) ON CONFLICT (wa_message_id) DO NOTHING RETURNING id""",
        (wa_message_id, client_id, mtype, body),
    )


def recent_messages(client_id: int, limit: int = 20, exclude_wa_id: str | None = None) -> list[dict]:
    rows = all_(
        """SELECT direction, type, body, created_at FROM messages
           WHERE client_id = %s AND (%s::text IS NULL OR wa_message_id IS DISTINCT FROM %s)
           ORDER BY created_at DESC, id DESC LIMIT %s""",
        (client_id, exclude_wa_id, exclude_wa_id, limit),
    )
    return list(reversed(rows))


def last_inbound_at(client_id: int) -> datetime | None:
    row = one("SELECT max(created_at) AS t FROM messages WHERE client_id = %s AND direction = 'in'", (client_id,))
    return row["t"] if row else None


# ---------------------------------------------------------------- bookings

BOOKING_SELECT = """
SELECT b.*, s.name AS service_name, s.code AS service_code, s.prep_tip,
       c.name AS client_name, c.phone AS client_phone
FROM bookings b JOIN services s ON s.id = b.service_id JOIN clients c ON c.id = b.client_id
"""


def booking(booking_id: int) -> dict | None:
    return one(BOOKING_SELECT + " WHERE b.id = %s", (booking_id,))


def client_upcoming_bookings(client_id: int) -> list[dict]:
    return all_(
        BOOKING_SELECT + " WHERE b.client_id = %s AND b.status IN ('pending','deposit_claimed','confirmed')"
        " AND b.start_at > now() ORDER BY b.start_at",
        (client_id,),
    )


def bookings_between(start: datetime, end: datetime, statuses: tuple[str, ...] = ACTIVE) -> list[dict]:
    return all_(
        BOOKING_SELECT + " WHERE b.start_at >= %s AND b.start_at < %s AND b.status = ANY(%s) ORDER BY b.start_at",
        (start, end, list(statuses)),
    )


def set_booking_status(booking_id: int, new_status: str, from_statuses: tuple[str, ...]) -> dict | None:
    """Atomic status change; returns the updated booking or None if it wasn't in an allowed state."""
    row = one(
        "UPDATE bookings SET status = %s WHERE id = %s AND status = ANY(%s) RETURNING id",
        (new_status, booking_id, list(from_statuses)),
    )
    return booking(booking_id) if row else None


def expire_stale_pending(pending_hold_hours: int) -> int:
    rows = all_(
        """UPDATE bookings SET status = 'cancelled'
           WHERE status = 'pending' AND created_at < now() - make_interval(hours => %s) RETURNING id""",
        (pending_hold_hours,),
    )
    return len(rows)


# ---------------------------------------------------------------- handoffs / blocked days

def create_handoff(client_id: int, reason: str) -> int:
    return one("INSERT INTO handoffs (client_id, reason) VALUES (%s, %s) RETURNING id", (client_id, reason[:1000]))["id"]


def open_handoff(client_id: int) -> dict | None:
    return one(
        "SELECT * FROM handoffs WHERE client_id = %s AND NOT resolved ORDER BY created_at DESC LIMIT 1", (client_id,)
    )


def handoff(handoff_id: int) -> dict | None:
    return one(
        "SELECT h.*, c.phone AS client_phone, c.name AS client_name FROM handoffs h"
        " JOIN clients c ON c.id = h.client_id WHERE h.id = %s",
        (handoff_id,),
    )


def resolve_handoff(handoff_id: int) -> bool:
    return one("UPDATE handoffs SET resolved = true WHERE id = %s RETURNING id", (handoff_id,)) is not None


def block_day(day: date, reason: str | None) -> None:
    one(
        "INSERT INTO blocked_days (day, reason) VALUES (%s, %s)"
        " ON CONFLICT (day) DO UPDATE SET reason = EXCLUDED.reason RETURNING id",
        (day, reason),
    )


def unblock_day(day: date) -> bool:
    return one("DELETE FROM blocked_days WHERE day = %s RETURNING id", (day,)) is not None
