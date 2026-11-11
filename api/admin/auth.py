"""/api/admin/auth - sign-in for admin users (password + authenticator-app code).

GET                       -> {state: bootstrap|signed_out|signed_in, user?}
POST {op: "bootstrap"}    -> first owner, only while there are no users and with ADMIN_BOOTSTRAP_TOKEN
POST {op: "login"}        -> email + password  -> {next: "otp", challenge}
POST {op: "otp"}          -> challenge + 6-digit code (or a recovery code) -> session cookie
POST {op: "invite_info"}  -> who an invite link is for
POST {op: "invite_accept"}-> set password from an invite link -> authenticator QR
POST {op: "enroll_confirm"} -> first code from the app -> recovery codes + session
POST {op: "change_password"} (signed in; also when expired)
POST {op: "recovery_regen"}  (signed in; needs a current code)
POST {op: "logout"}
"""

from __future__ import annotations

import hmac
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _lib import db, security  # noqa: E402
from _lib import admin_auth as A  # noqa: E402
from _lib.http import safe  # noqa: E402

GENERIC_LOGIN = "Email or password is incorrect."
HISTORY = 5


def _user_by_email(email: str) -> dict | None:
    return db.one("SELECT * FROM admin_users WHERE email = %s", (email,))


def _user(uid: int) -> dict | None:
    return db.one("SELECT * FROM admin_users WHERE id = %s", (uid,))


def _set_password(uid: int, password: str) -> None:
    h = security.hash_password(password)
    with db.tx() as c:
        c.execute("UPDATE admin_users SET password_hash = %s, password_changed_at = now() WHERE id = %s", (h, uid))
        c.execute("INSERT INTO admin_password_history (user_id, hash) VALUES (%s, %s)", (uid, h))
        c.execute("""DELETE FROM admin_password_history WHERE user_id = %s AND id NOT IN
                     (SELECT id FROM admin_password_history WHERE user_id = %s ORDER BY created_at DESC LIMIT %s)""",
                  (uid, uid, HISTORY))


def _reused(uid: int, password: str) -> bool:
    rows = db.all_("SELECT hash FROM admin_password_history WHERE user_id = %s ORDER BY created_at DESC LIMIT %s", (uid, HISTORY))
    return any(security.verify_password(password, r["hash"]) for r in rows)


def _begin_enrolment(user: dict) -> dict:
    secret = security.new_totp_secret()
    db.one("UPDATE admin_users SET totp_secret_enc = %s, totp_enabled = false, totp_last_step = 0 WHERE id = %s RETURNING id",
           (security.encrypt(secret), user["id"]))
    token = A.new_challenge(user["id"], "enroll", 15)
    return {"next": "enroll", "enroll": token, "otpauth": security.otpauth_uri(secret, user["email"]), "secret": secret}


class handler(A.AdminHandler):
    @safe
    def do_GET(self):
        if not db.one("SELECT 1 AS x FROM admin_users LIMIT 1"):
            return self.send_json(200, {"ok": True, "state": "bootstrap"})
        u = A.current(self)
        if not u:
            return self.send_json(200, {"ok": True, "state": "signed_out"})
        self.send_json(200, {"ok": True, "state": "signed_in", "user": A.public_user(u)})

    @safe
    def do_POST(self):
        if not self.csrf_ok():
            return
        d = self.body() or {}
        op = d.get("op")
        fn = getattr(self, f"op_{op}", None) if isinstance(op, str) and op.isidentifier() else None
        if not fn:
            return self.error(400, "op", "Unknown request.")
        ip_h = self.ip_h()
        if op in ("bootstrap", "login", "otp", "invite_accept", "enroll_confirm", "invite_info") and A.ip_blocked(ip_h):
            return self.error(429, "rate", "Too many attempts from this network. Wait 15 minutes and try again.")
        fn(d, ip_h)

    # ---------------------------------------------------------------- first owner
    def op_bootstrap(self, d, ip_h):
        expected = os.environ.get("ADMIN_BOOTSTRAP_TOKEN") or ""
        if db.one("SELECT 1 AS x FROM admin_users LIMIT 1") or len(expected) < 24:
            return self.error(403, "closed", "Setup is closed.")
        if not hmac.compare_digest(security.sha256(str(d.get("token", ""))), security.sha256(expected)):
            A.record_ip(ip_h, False)
            return self.error(403, "token", "That setup code isn't right.")
        email = str(d.get("email", "")).strip().lower()
        name = str(d.get("name", "")).strip()[:60]
        pw = str(d.get("password", ""))
        if "@" not in email or len(email) > 120 or not name:
            return self.error(400, "fields", "Enter your name and a valid email.")
        problem = security.password_problem(pw, email, name)
        if problem:
            return self.error(400, "password", problem)
        row = db.one("INSERT INTO admin_users (email, name, role) VALUES (%s, %s, 'owner') RETURNING *", (email, name))
        _set_password(row["id"], pw)
        A.audit(row["id"], "owner_created", email, ip_h)
        self.send_json(200, {"ok": True, **_begin_enrolment(row)})

    # ---------------------------------------------------------------- password, then code
    def op_login(self, d, ip_h):
        email = str(d.get("email", "")).strip().lower()[:120]
        pw = str(d.get("password", ""))[:200]
        user = _user_by_email(email) if email else None
        ok = security.verify_password(pw, user["password_hash"] if user else None)
        if user and A.locked_minutes(user):
            A.record_ip(ip_h, False)
            return self.error(429, "locked", f"Too many attempts. Try again in {A.locked_minutes(user)} minutes.")
        if not (user and ok and user["active"] and user["totp_enabled"]):
            A.record_ip(ip_h, False)
            if user:
                A.register_fail(user)
                A.audit(user["id"], "login_failed", "password", ip_h)
            return self.error(401, "login", GENERIC_LOGIN)
        self.send_json(200, {"ok": True, "next": "otp", "challenge": A.new_challenge(user["id"], "otp", 5)})

    def op_otp(self, d, ip_h):
        ch = A.find_challenge(str(d.get("challenge", "")), "otp")
        if not ch:
            return self.error(401, "expired", "That sign-in expired. Please start again.")
        user = _user(ch["user_id"])
        if not user or not user["active"]:
            return self.error(401, "expired", "That sign-in expired. Please start again.")
        if A.locked_minutes(user):
            return self.error(429, "locked", f"Too many attempts. Try again in {A.locked_minutes(user)} minutes.")
        code = str(d.get("code", "")).strip()
        ok, how = False, "otp"
        if any(ch_.isalpha() for ch_ in code):  # recovery code
            how = "recovery"
            norm = security.normalise_recovery(code)
            if norm:
                row = db.one("UPDATE admin_recovery_codes SET used_at = now() WHERE user_id = %s AND code_hash = %s AND used_at IS NULL RETURNING id",
                             (user["id"], security.sha256(norm)))
                ok = bool(row)
        else:
            secret = security.decrypt(user["totp_secret_enc"] or "")
            step = security.totp_match(secret, code, user["totp_last_step"]) if secret else None
            if step is not None:
                # atomic: a code can only ever be used once, even by two requests at the same instant
                ok = bool(db.one("UPDATE admin_users SET totp_last_step = %s WHERE id = %s AND totp_last_step < %s RETURNING id",
                                 (step, user["id"], step)))
        if not ok:
            A.record_ip(ip_h, False)
            A.register_fail(user)
            A.audit(user["id"], "login_failed", how, ip_h)
            alive = A.challenge_attempt(ch)
            return self.error(401, "code", "That code isn't right." if alive else "Too many wrong codes. Please start again.",
                              restart=not alive)
        A.burn_challenge(ch["id"])
        A.register_success(user["id"])
        A.record_ip(ip_h, True)
        A.audit(user["id"], "login", how, ip_h)
        self.extra_headers = [("Set-Cookie", A.start_session(self, user["id"]))]
        left = db.one("SELECT count(*) AS n FROM admin_recovery_codes WHERE user_id = %s AND used_at IS NULL", (user["id"],))["n"]
        self.send_json(200, {"ok": True, "signed_in": True, "recovery_left": left})

    # ---------------------------------------------------------------- invites + authenticator setup
    def op_invite_info(self, d, ip_h):
        ch = A.find_challenge(str(d.get("token", "")), "invite")
        if not ch:
            A.record_ip(ip_h, False)
            return self.error(404, "invite", "This invite link has expired or was already used. Ask the owner for a new one.")
        u = _user(ch["user_id"])
        self.send_json(200, {"ok": True, "name": u["name"], "email": u["email"]})

    def op_invite_accept(self, d, ip_h):
        ch = A.find_challenge(str(d.get("token", "")), "invite")
        if not ch:
            A.record_ip(ip_h, False)
            return self.error(404, "invite", "This invite link has expired or was already used. Ask the owner for a new one.")
        u = _user(ch["user_id"])
        pw = str(d.get("password", ""))
        problem = security.password_problem(pw, u["email"], u["name"])
        if problem:
            return self.error(400, "password", problem)
        if _reused(u["id"], pw):
            return self.error(400, "password", "You've used that password before. Pick a new one.")
        _set_password(u["id"], pw)
        A.burn_challenge(ch["id"])
        A.audit(u["id"], "invite_accepted", "", ip_h)
        self.send_json(200, {"ok": True, **_begin_enrolment(u)})

    def op_enroll_confirm(self, d, ip_h):
        ch = A.find_challenge(str(d.get("enroll", "")), "enroll")
        if not ch:
            return self.error(401, "expired", "Setup timed out. Use your invite link again or ask the owner for a new one.")
        u = _user(ch["user_id"])
        secret = security.decrypt(u["totp_secret_enc"] or "")
        step = security.totp_match(secret, str(d.get("code", "")), 0) if secret else None
        if step is None:
            A.record_ip(ip_h, False)
            alive = A.challenge_attempt(ch, 8)
            return self.error(400, "code", "That code doesn't match. Check the app shows 'Qoui Admin' and try the newest code."
                              if alive else "Too many wrong codes. Ask the owner for a new invite.")
        codes = security.new_recovery_codes()
        with db.tx() as c:
            c.execute("UPDATE admin_users SET totp_enabled = true, totp_last_step = %s, failed_count = 0, locked_until = NULL WHERE id = %s",
                      (step, u["id"]))
            c.execute("DELETE FROM admin_recovery_codes WHERE user_id = %s", (u["id"],))
            for code in codes:
                c.execute("INSERT INTO admin_recovery_codes (user_id, code_hash) VALUES (%s, %s)", (u["id"], security.sha256(code)))
        A.burn_challenge(ch["id"])
        A.record_ip(ip_h, True)
        A.audit(u["id"], "authenticator_enabled", "", ip_h)
        self.extra_headers = [("Set-Cookie", A.start_session(self, u["id"]))]
        self.send_json(200, {"ok": True, "signed_in": True, "recovery_codes": codes})

    # ---------------------------------------------------------------- signed-in account actions
    def op_change_password(self, d, ip_h):
        u = self.require(allow_expired=True)
        if not u:
            return
        cur, new = str(d.get("current", ""))[:200], str(d.get("new", ""))
        if not security.verify_password(cur, u["password_hash"]):
            A.register_fail(u)
            A.audit(u["id"], "password_change_failed", "", ip_h)
            return self.error(400, "current", "Your current password isn't right.")
        problem = security.password_problem(new, u["email"], u["name"])
        if problem:
            return self.error(400, "password", problem)
        if _reused(u["id"], new):
            return self.error(400, "password", f"You can't reuse any of your last {HISTORY} passwords.")
        _set_password(u["id"], new)
        A.revoke_user_sessions(u["id"], except_session=u["session_id"])
        A.audit(u["id"], "password_changed", "", ip_h)
        self.send_json(200, {"ok": True})

    def op_recovery_regen(self, d, ip_h):
        u = self.require()
        if not u:
            return
        secret = security.decrypt(u["totp_secret_enc"] or "")
        step = security.totp_match(secret, str(d.get("code", "")), u["totp_last_step"]) if secret else None
        if step is None or not db.one("UPDATE admin_users SET totp_last_step = %s WHERE id = %s AND totp_last_step < %s RETURNING id",
                                      (step, u["id"], step)):
            return self.error(400, "code", "That code isn't right.")
        codes = security.new_recovery_codes()
        with db.tx() as c:
            c.execute("DELETE FROM admin_recovery_codes WHERE user_id = %s", (u["id"],))
            for code in codes:
                c.execute("INSERT INTO admin_recovery_codes (user_id, code_hash) VALUES (%s, %s)", (u["id"], security.sha256(code)))
        A.audit(u["id"], "recovery_codes_regenerated", "", ip_h)
        self.send_json(200, {"ok": True, "recovery_codes": codes})

    def op_logout(self, d, ip_h):
        u = A.current(self)
        A.end_session(self)
        if u:
            A.audit(u["id"], "logout", "", ip_h)
        self.extra_headers = [("Set-Cookie", A.session_cookie(self, "", 0))]
        self.send_json(200, {"ok": True})
