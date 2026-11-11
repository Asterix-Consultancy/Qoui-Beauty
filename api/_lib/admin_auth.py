"""Admin sessions, roles, lockouts and audit trail.

- Sessions are server-side: the browser holds a random 256-bit token in an HttpOnly, Secure,
  SameSite=Strict cookie (`__Host-` prefixed on HTTPS); the database stores only its SHA-256.
  Sessions end after inactivity and after an absolute lifetime, and can be revoked.
- Every state-changing request must be same-origin AND carry the X-Qoui-Admin header (CSRF).
- Failed sign-ins are limited per IP and per account (with growing lockouts).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from . import db, security
from .http import JsonHandler, ip_hash

IP_MAX_FAILS = 10          # failed auth steps per IP...
IP_WINDOW_MIN = 15         # ...per 15 minutes
ACCOUNT_LOCK_EVERY = 5     # lock the account after every 5 consecutive failures
ACCOUNT_LOCK_BASE_MIN = 15 # 15, 30, 60 ... minutes, capped at 24 h
CSRF_HEADER = "X-Qoui-Admin"


def conf() -> dict[str, int]:
    s = db.settings()
    return {
        "max_age_days": db.setting_int(s, "password_max_age_days", 90),
        "idle_min": db.setting_int(s, "session_idle_min", 60),
        "max_hours": db.setting_int(s, "session_max_hours", 12),
    }


def audit(user_id: int | None, action: str, detail: str = "", ip_h: str | None = None) -> None:
    db.one("INSERT INTO admin_audit (user_id, action, detail, ip_hash) VALUES (%s, %s, %s, %s) RETURNING id",
           (user_id, action, detail[:300], ip_h))


# ---------------------------------------------------------------- rate limits + lockouts

def ip_blocked(ip_h: str) -> bool:
    row = db.one("SELECT count(*) AS n FROM admin_login_attempts WHERE ip_hash = %s AND NOT ok"
                 " AND created_at > now() - make_interval(mins => %s)", (ip_h, IP_WINDOW_MIN))
    return bool(row and row["n"] >= IP_MAX_FAILS)


def record_ip(ip_h: str, ok: bool) -> None:
    db.one("INSERT INTO admin_login_attempts (ip_hash, ok) VALUES (%s, %s) RETURNING id", (ip_h, ok))
    db.one("DELETE FROM admin_login_attempts WHERE created_at < now() - interval '2 days' RETURNING id")


def locked_minutes(user: dict) -> int:
    lu = user.get("locked_until")
    if lu and lu > datetime.now(timezone.utc):
        return max(1, int((lu - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
    return 0


def register_fail(user: dict) -> None:
    n = user["failed_count"] + 1
    lock = None
    if n % ACCOUNT_LOCK_EVERY == 0:
        mins = min(ACCOUNT_LOCK_BASE_MIN * 2 ** (n // ACCOUNT_LOCK_EVERY - 1), 24 * 60)
        lock = datetime.now(timezone.utc) + timedelta(minutes=mins)
    db.one("UPDATE admin_users SET failed_count = %s, locked_until = COALESCE(%s, locked_until) WHERE id = %s RETURNING id",
           (n, lock, user["id"]))


def register_success(user_id: int) -> None:
    db.one("UPDATE admin_users SET failed_count = 0, locked_until = NULL, last_login_at = now() WHERE id = %s RETURNING id", (user_id,))


# ---------------------------------------------------------------- challenges (one-time tokens)

def new_challenge(user_id: int, kind: str, minutes: int) -> str:
    token = security.new_token()
    with db.tx() as c:
        # one live challenge per user and kind
        c.execute("UPDATE admin_challenges SET used_at = now() WHERE user_id = %s AND kind = %s AND used_at IS NULL", (user_id, kind))
        c.execute("INSERT INTO admin_challenges (token_hash, user_id, kind, expires_at) VALUES (%s, %s, %s, now() + make_interval(mins => %s))",
                  (security.sha256(token), user_id, kind, minutes))
    return token


def find_challenge(token: str, kind: str) -> dict | None:
    if not token or len(token) > 100:
        return None
    return db.one(
        "SELECT * FROM admin_challenges WHERE token_hash = %s AND kind = %s AND used_at IS NULL AND expires_at > now()",
        (security.sha256(token), kind),
    )


def burn_challenge(ch_id: int) -> None:
    db.one("UPDATE admin_challenges SET used_at = now() WHERE id = %s RETURNING id", (ch_id,))


def challenge_attempt(ch: dict, max_attempts: int = 5) -> bool:
    """Count a wrong attempt; returns False once the challenge is used up."""
    row = db.one("UPDATE admin_challenges SET attempts = attempts + 1, used_at = CASE WHEN attempts + 1 >= %s THEN now() END"
                 " WHERE id = %s RETURNING attempts", (max_attempts, ch["id"]))
    return bool(row and row["attempts"] < max_attempts)


# ---------------------------------------------------------------- sessions

def _cookie_name(handler: JsonHandler) -> str:
    return "qoui_s" if _is_local(handler) else "__Host-qoui_s"


def _is_local(handler: JsonHandler) -> bool:
    host = (handler.headers.get("X-Forwarded-Host") or handler.headers.get("Host") or "").split(":")[0]
    return host in ("localhost", "127.0.0.1")


def session_cookie(handler: JsonHandler, token: str, max_age: int) -> str:
    secure = "" if _is_local(handler) else " Secure;"
    return f"{_cookie_name(handler)}={token}; Path=/; HttpOnly;{secure} SameSite=Strict; Max-Age={max_age}"


def start_session(handler: JsonHandler, user_id: int) -> str:
    c = conf()
    token = security.new_token()
    ua = (handler.headers.get("User-Agent") or "")[:160]
    db.one(
        "INSERT INTO admin_sessions (token_hash, user_id, expires_at, ip_hash, user_agent)"
        " VALUES (%s, %s, now() + make_interval(hours => %s), %s, %s) RETURNING id",
        (security.sha256(token), user_id, c["max_hours"], ip_hash(handler.client_ip()), ua),
    )
    return session_cookie(handler, token, c["max_hours"] * 3600)


def _token(handler: JsonHandler) -> str | None:
    name = _cookie_name(handler)
    for part in (handler.headers.get("Cookie") or "").split(";"):
        k, _, v = part.strip().partition("=")
        if k == name and 20 < len(v) < 100:
            return v
    return None


def current(handler: JsonHandler) -> dict | None:
    """The signed-in admin user (with session_id and password_expired), or None."""
    tok = _token(handler)
    if not tok:
        return None
    c = conf()
    row = db.one(
        """SELECT s.id AS session_id, s.last_seen_at, u.*
           FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
           WHERE s.token_hash = %s AND s.revoked_at IS NULL AND s.expires_at > now()
             AND s.last_seen_at > now() - make_interval(mins => %s)
             AND u.active AND u.totp_enabled AND u.password_hash IS NOT NULL""",
        (security.sha256(tok), c["idle_min"]),
    )
    if not row:
        return None
    if row["last_seen_at"] < datetime.now(timezone.utc) - timedelta(seconds=60):
        db.one("UPDATE admin_sessions SET last_seen_at = now() WHERE id = %s RETURNING id", (row["session_id"],))
    changed = row["password_changed_at"]
    row["password_expired"] = bool(not changed or changed < datetime.now(timezone.utc) - timedelta(days=c["max_age_days"]))
    row["password_days_left"] = max(0, c["max_age_days"] - (datetime.now(timezone.utc) - changed).days) if changed else 0
    return row


def end_session(handler: JsonHandler) -> None:
    tok = _token(handler)
    if tok:
        db.one("UPDATE admin_sessions SET revoked_at = now() WHERE token_hash = %s RETURNING id", (security.sha256(tok),))


def revoke_user_sessions(user_id: int, except_session: int | None = None) -> None:
    db.one("UPDATE admin_sessions SET revoked_at = now() WHERE user_id = %s AND revoked_at IS NULL AND id IS DISTINCT FROM %s RETURNING id",
           (user_id, except_session))


def public_user(u: dict) -> dict:
    return {"id": u["id"], "email": u["email"], "name": u["name"], "role": u["role"],
            "password_expired": u.get("password_expired", False), "password_days_left": u.get("password_days_left")}


# ---------------------------------------------------------------- base handler

class AdminHandler(JsonHandler):
    def send_json(self, status: int, payload: dict, cache: str = "no-store") -> None:
        self.extra_headers = list(getattr(self, "extra_headers", [])) + [("X-Robots-Tag", "noindex")]
        super().send_json(status, payload, cache="no-store")

    def csrf_ok(self) -> bool:
        if not self.same_origin() or self.headers.get(CSRF_HEADER) != "1":
            self.error(403, "csrf", "Request blocked. Reload the page and try again.")
            return False
        return True

    def require(self, role: str | None = None, post: bool = False, allow_expired: bool = False) -> dict | None:
        if post and not self.csrf_ok():
            return None
        user = current(self)
        if not user:
            self.error(401, "auth", "Please sign in again.")
            return None
        if user["password_expired"] and not allow_expired:
            self.error(403, "password_expired", "Your password has expired. Please set a new one.")
            return None
        if role == "owner" and user["role"] != "owner":
            self.error(403, "forbidden", "Only the owner can do that.")
            return None
        return user

    def ip_h(self) -> str:
        return ip_hash(self.client_ip())
