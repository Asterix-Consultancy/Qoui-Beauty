"""/api/admin/users - owner only: invite people, reset, disable, change role, sign out devices; audit log.

GET  -> users + recent audit log
POST {op: invite|reset|disable|enable|revoke|role, ...}
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _lib import db  # noqa: E402
from _lib import admin_auth as A  # noqa: E402
from _lib.http import safe  # noqa: E402

INVITE_HOURS = 48
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")


def users() -> list[dict]:
    rows = db.all_(
        """SELECT u.id, u.email, u.name, u.role, u.active, u.totp_enabled, u.password_changed_at, u.last_login_at,
                  u.locked_until > now() AS locked, u.created_at,
                  (SELECT count(*) FROM admin_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()) AS sessions,
                  (SELECT count(*) FROM admin_recovery_codes r WHERE r.user_id = u.id AND r.used_at IS NULL) AS recovery_left
           FROM admin_users u ORDER BY u.role DESC, u.created_at"""
    )
    return [{**r, "status": "disabled" if not r["active"] else "invited" if not r["totp_enabled"] else "active"} for r in rows]


def audit_log() -> list[dict]:
    return db.all_(
        """SELECT a.created_at, a.action, a.detail, u.name AS user_name, left(a.ip_hash, 6) AS device
           FROM admin_audit a LEFT JOIN admin_users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 150"""
    )


def active_owners(exclude: int | None = None) -> int:
    return db.one("SELECT count(*) AS n FROM admin_users WHERE role = 'owner' AND active AND id IS DISTINCT FROM %s",
                  (exclude,))["n"]


class handler(A.AdminHandler):
    def invite_link(self, token: str) -> str:
        host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or ""
        proto = "http" if host.startswith(("localhost", "127.0.0.1")) else "https"
        return f"{proto}://{host}/admin?invite={token}"

    @safe
    def do_GET(self):
        if not self.require(role="owner"):
            return
        self.send_json(200, {"ok": True, "users": users(), "audit": audit_log()})

    @safe
    def do_POST(self):
        me = self.require(role="owner", post=True)
        if not me:
            return
        d = self.body() or {}
        op = d.get("op")
        ip_h = self.ip_h()
        extra: dict = {}

        if op == "invite":
            email = str(d.get("email", "")).strip().lower()
            name = str(d.get("name", "")).strip()[:60]
            role = d.get("role") if d.get("role") in ("owner", "staff") else "staff"
            if not EMAIL.match(email) or not name:
                return self.error(400, "fields", "Enter a name and a valid email.")
            if db.one("SELECT 1 AS x FROM admin_users WHERE email = %s", (email,)):
                return self.error(409, "exists", "Someone with that email already has access.")
            u = db.one("INSERT INTO admin_users (email, name, role) VALUES (%s, %s, %s) RETURNING id", (email, name, role))
            extra["invite_link"] = self.invite_link(A.new_challenge(u["id"], "invite", INVITE_HOURS * 60))
            A.audit(me["id"], "user_invited", f"{email} ({role})", ip_h)
        else:
            try:
                uid = int(d.get("id"))
            except (TypeError, ValueError):
                return self.error(400, "id", "Pick a person.")
            target = db.one("SELECT * FROM admin_users WHERE id = %s", (uid,))
            if not target:
                return self.error(404, "missing", "That person no longer exists.")
            self_target = uid == me["id"]
            if op == "reset":
                if self_target:
                    return self.error(400, "self", "To change your own password use My account.")
                with db.tx() as c:
                    c.execute("""UPDATE admin_users SET password_hash = NULL, totp_secret_enc = NULL, totp_enabled = false,
                                 totp_last_step = 0, failed_count = 0, locked_until = NULL, active = true WHERE id = %s""", (uid,))
                    c.execute("DELETE FROM admin_recovery_codes WHERE user_id = %s", (uid,))
                A.revoke_user_sessions(uid)
                extra["invite_link"] = self.invite_link(A.new_challenge(uid, "invite", INVITE_HOURS * 60))
                A.audit(me["id"], "user_reset", target["email"], ip_h)
            elif op in ("disable", "enable"):
                if self_target:
                    return self.error(400, "self", "You can't disable your own access.")
                if op == "disable" and target["role"] == "owner" and active_owners(exclude=uid) == 0:
                    return self.error(400, "last_owner", "Keep at least one owner.")
                db.one("UPDATE admin_users SET active = %s WHERE id = %s RETURNING id", (op == "enable", uid))
                if op == "disable":
                    A.revoke_user_sessions(uid)
                A.audit(me["id"], f"user_{op}d", target["email"], ip_h)
            elif op == "revoke":
                A.revoke_user_sessions(uid, except_session=me["session_id"] if self_target else None)
                A.audit(me["id"], "sessions_revoked", target["email"], ip_h)
            elif op == "role":
                role = d.get("role")
                if role not in ("owner", "staff"):
                    return self.error(400, "role", "Unknown role.")
                if role == "staff" and target["role"] == "owner" and active_owners(exclude=uid) == 0:
                    return self.error(400, "last_owner", "Keep at least one owner.")
                db.one("UPDATE admin_users SET role = %s WHERE id = %s RETURNING id", (role, uid))
                A.audit(me["id"], "role_changed", f"{target['email']} -> {role}", ip_h)
            else:
                return self.error(400, "op", "Unknown action.")
        self.send_json(200, {"ok": True, "users": users(), "audit": audit_log(), **extra})
