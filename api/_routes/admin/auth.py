"""/api/admin/auth - sign-in for admin users (password + authenticator-app code).

GET                       -> {state: bootstrap|signed_out|signed_in, user?}
POST {op: "master"}       -> ADMIN_MASTER_KEY: create the first/another owner, or recover an account
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

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))  # api/

import secrets  # noqa: E402

from _lib import db, mailer, security  # noqa: E402
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
    """2-step setup starts by choosing: emailed codes (easiest) or an authenticator app (most secure)."""
    db.one("UPDATE admin_users SET totp_secret_enc = NULL, totp_enabled = false, totp_last_step = 0 WHERE id = %s RETURNING id",
           (user["id"],))
    token = A.new_challenge(user["id"], "enroll", 20)
    return {"next": "choose", "enroll": token, "email": mailer.mask(user["email"]), "email_available": mailer.available()}


def _code_hash(ch_id: int, code: str) -> str:
    return security.sha256(f"{ch_id}:{code}")


EMAIL_PER_HOUR = 10


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
        if op in ("master", "bootstrap", "login", "otp", "invite_accept", "enroll_confirm", "invite_info", "enroll_method", "resend") \
                and A.ip_blocked(ip_h):
            return self.error(429, "rate", "Too many attempts from this network. Wait 15 minutes and try again.")
        fn(d, ip_h)

    # ---------------------------------------------------------------- emailed codes
    def _local(self) -> bool:
        host = (self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or "").split(":")[0]
        return host in ("localhost", "127.0.0.1")

    def _email_code(self, ch: dict, user: dict, purpose: str, ip_h: str) -> dict | None:
        """Send a fresh 6-digit code for this challenge. Returns extra response fields, or None after sending an error."""
        sent_hour = db.one("SELECT count(*) AS n FROM admin_audit WHERE user_id = %s AND action = 'email_code_sent'"
                           " AND created_at > now() - interval '1 hour'", (user["id"],))["n"]
        if sent_hour >= EMAIL_PER_HOUR:
            self.error(429, "email_rate", "Too many codes sent. Wait an hour, or use a recovery code.")
            return None
        code = f"{secrets.randbelow(10 ** 6):06d}"
        try:
            mailer.send_code(user["email"], user["name"], code, purpose)
        except Exception:
            A.audit(user["id"], "email_code_failed", purpose, ip_h)
            self.error(503, "email", "We couldn't send the email code just now. Try again in a minute, or use a recovery code.")
            return None
        db.one("UPDATE admin_challenges SET code_hash = %s, sends = sends + 1, last_sent_at = now() WHERE id = %s RETURNING id",
               (_code_hash(ch["id"], code), ch["id"]))
        A.audit(user["id"], "email_code_sent", purpose, ip_h)
        extra = {"sent_to": mailer.mask(user["email"])}
        if mailer.dry_run() and self._local():
            extra["dev_code"] = code  # local development only: no SMTP configured
        return extra

    def _email_ok(self, ch: dict, code: str) -> bool:
        code = "".join(c for c in str(code) if c.isdigit())
        sent = ch.get("last_sent_at")
        fresh = sent is not None and (db.one("SELECT now() - %s < interval '10 minutes' AS ok", (sent,))["ok"])
        return bool(fresh and ch.get("code_hash") and len(code) == 6 and hmac.compare_digest(ch["code_hash"], _code_hash(ch["id"], code)))

    def op_resend(self, d, ip_h):
        token = str(d.get("challenge") or d.get("enroll") or "")
        ch = A.find_challenge(token, "otp") or A.find_challenge(token, "enroll")
        if not ch:
            return self.error(401, "expired", "That sign-in expired. Please start again.")
        user = _user(ch["user_id"])
        if user["mfa_method"] != "email":
            return self.error(400, "method", "This account uses an authenticator app.")
        if ch["sends"] >= 4:
            return self.error(429, "email_rate", "That's enough codes for this sign-in. Start again.")
        if ch["last_sent_at"] and db.one("SELECT now() - %s < interval '60 seconds' AS wait", (ch["last_sent_at"],))["wait"]:
            return self.error(429, "wait", "Please wait a minute before asking for another code.")
        extra = self._email_code(ch, user, "enroll" if ch["kind"] == "enroll" else "login", ip_h)
        if extra is not None:
            self.send_json(200, {"ok": True, **extra})

    # ---------------------------------------------------------------- master key (create / recover an owner)
    def op_master(self, d, ip_h):
        """Break-glass access with ADMIN_MASTER_KEY (a Vercel secret, never in code). Works forever to:
        create the first owner, add another owner, or recover an existing account (new password + new
        authenticator; all its sessions signed out). It never skips the authenticator step."""
        key = os.environ.get("ADMIN_MASTER_KEY") or os.environ.get("ADMIN_BOOTSTRAP_TOKEN") or ""
        if len(key) < 32:
            return self.error(403, "closed", "This option isn't available.")
        fails = db.one("SELECT count(*) AS n FROM admin_audit WHERE action = 'master_key_failed' AND ip_hash = %s"
                       " AND created_at > now() - interval '1 hour'", (ip_h,))["n"]
        if fails >= 5:
            return self.error(429, "rate", "Too many wrong tries from this network. Try again in an hour.")
        if not hmac.compare_digest(security.sha256(str(d.get("token", "")).strip()), security.sha256(key)):
            A.record_ip(ip_h, False)
            A.audit(None, "master_key_failed", "", ip_h)
            return self.error(403, "token", "That key isn't right.")
        email = str(d.get("email", "")).strip().lower()
        name = str(d.get("name", "")).strip()[:60]
        pw = str(d.get("password", ""))
        if "@" not in email or len(email) > 120 or not name:
            return self.error(400, "fields", "Enter your name and a valid email.")
        problem = security.password_problem(pw, email, name)
        if problem:
            return self.error(400, "password", problem)
        existing = _user_by_email(email)
        if existing:
            with db.tx() as c:
                c.execute("""UPDATE admin_users SET name = %s, role = 'owner', active = true, totp_enabled = false,
                             totp_secret_enc = NULL, totp_last_step = 0, failed_count = 0, locked_until = NULL WHERE id = %s""",
                          (name, existing["id"]))
                c.execute("DELETE FROM admin_recovery_codes WHERE user_id = %s", (existing["id"],))
            A.revoke_user_sessions(existing["id"])
            row = _user(existing["id"])
            action = "master_key_recovered"
        else:
            row = db.one("INSERT INTO admin_users (email, name, role) VALUES (%s, %s, 'owner') RETURNING *", (email, name))
            action = "master_key_owner_created"
        _set_password(row["id"], pw)
        A.record_ip(ip_h, True)
        A.audit(row["id"], action, email, ip_h)
        self.send_json(200, {"ok": True, "recovered": bool(existing), **_begin_enrolment(row)})

    def op_bootstrap(self, d, ip_h):  # older name, same thing
        self.op_master(d, ip_h)

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
        token = A.new_challenge(user["id"], "otp", 10)
        out = {"ok": True, "next": "otp", "challenge": token, "method": user["mfa_method"]}
        if user["mfa_method"] == "email":
            extra = self._email_code(A.find_challenge(token, "otp"), user, "login", ip_h)
            if extra is None:
                return
            out.update(extra)
        self.send_json(200, out)

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
        elif user["mfa_method"] == "email":
            how = "email"
            ok = self._email_ok(ch, code)
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

    def op_enroll_method(self, d, ip_h):
        ch = A.find_challenge(str(d.get("enroll", "")), "enroll")
        if not ch:
            return self.error(401, "expired", "Setup timed out. Use your invite link again or ask the owner for a new one.")
        u = _user(ch["user_id"])
        method = d.get("method")
        if method == "app":
            secret = security.new_totp_secret()
            db.one("UPDATE admin_users SET mfa_method = 'app', totp_secret_enc = %s, totp_last_step = 0 WHERE id = %s RETURNING id",
                   (security.encrypt(secret), u["id"]))
            return self.send_json(200, {"ok": True, "method": "app", "otpauth": security.otpauth_uri(secret, u["email"]), "secret": secret})
        if method == "email":
            if not mailer.available():
                return self.error(400, "email_off", "Email codes aren't set up on the server yet. Use an authenticator app for now.")
            db.one("UPDATE admin_users SET mfa_method = 'email', totp_secret_enc = NULL WHERE id = %s RETURNING id", (u["id"],))
            extra = self._email_code(ch, u, "enroll", ip_h)
            if extra is not None:
                self.send_json(200, {"ok": True, "method": "email", **extra})
            return
        self.error(400, "method", "Pick email or authenticator app.")

    def op_enroll_confirm(self, d, ip_h):
        ch = A.find_challenge(str(d.get("enroll", "")), "enroll")
        if not ch:
            return self.error(401, "expired", "Setup timed out. Use your invite link again or ask the owner for a new one.")
        u = _user(ch["user_id"])
        if u["mfa_method"] == "email":
            step = 0 if self._email_ok(ch, str(d.get("code", ""))) else None
        else:
            secret = security.decrypt(u["totp_secret_enc"] or "")
            step = security.totp_match(secret, str(d.get("code", "")), 0) if secret else None
        if step is None:
            A.record_ip(ip_h, False)
            alive = A.challenge_attempt(ch, 8)
            return self.error(400, "code", ("That code doesn't match. Check the newest email from Qoui." if u["mfa_method"] == "email"
                                            else "That code doesn't match. Check the app shows 'Qoui Admin' and try the newest code.")
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
        A.audit(u["id"], "authenticator_enabled", u["mfa_method"], ip_h)
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
        if u["mfa_method"] == "email":
            if not security.verify_password(str(d.get("password", ""))[:200], u["password_hash"]):
                return self.error(400, "password", "Your password isn't right.")
        else:
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
