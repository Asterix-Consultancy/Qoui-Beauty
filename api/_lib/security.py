"""Security primitives for admin accounts: password hashing, TOTP (authenticator app), encryption,
password policy and random tokens. Standard library + `cryptography` only.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import struct
import time
from urllib.parse import quote

from cryptography.fernet import Fernet, InvalidToken

# ---------------------------------------------------------------- passwords (scrypt)

_N, _R, _P, _DKLEN = 2 ** 15, 8, 1, 32
_MAXMEM = 64 * 1024 * 1024


def _pepper() -> bytes:
    # Optional server-side secret mixed into every hash: a stolen database alone can't be cracked.
    return (os.environ.get("PASSWORD_PEPPER") or "").encode()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode() + _pepper(), salt=salt, n=_N, r=_R, p=_P, maxmem=_MAXMEM, dklen=_DKLEN)
    return "scrypt${}${}${}${}${}".format(_N, _R, _P, base64.b64encode(salt).decode(), base64.b64encode(dk).decode())


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        # Spend the same time as a real check so unknown accounts can't be detected by timing.
        hash_password(password)
        return False
    try:
        _, n, r, p, salt_b64, dk_b64 = stored.split("$")
        dk = hashlib.scrypt(password.encode() + _pepper(), salt=base64.b64decode(salt_b64), n=int(n), r=int(r), p=int(p),
                            maxmem=_MAXMEM, dklen=len(base64.b64decode(dk_b64)))
        return hmac.compare_digest(dk, base64.b64decode(dk_b64))
    except Exception:
        return False


COMMON = {
    "password", "password1", "password123", "123456789012", "qwertyuiop", "qwerty123456", "iloveyou", "admin123",
    "letmein", "welcome", "welcome123", "monkey", "dragon", "football", "sunshine", "princess", "nairobi", "kenya",
    "qoui", "qouiglam", "qouiglamstudio", "makeup", "glamstudio", "beauty", "donholm", "betty", "asterisk",
}


def password_problem(password: str, email: str = "", name: str = "") -> str | None:
    """None if acceptable, else a message the user can act on (NIST 800-63B style: length + blocklist)."""
    if len(password) < 12:
        return "Use at least 12 characters. A short sentence works well."
    if len(password) > 128:
        return "That's too long (128 characters max)."
    low = password.lower()
    squashed = "".join(ch for ch in low if ch.isalnum())
    if low in COMMON or squashed in COMMON or any(w in squashed and len(squashed) - len(w) < 4 for w in COMMON):
        return "That password is too common. Pick something only you would think of."
    if len(set(password)) < 5:
        return "Use more different characters."
    local = email.split("@")[0].lower()
    if (len(local) >= 4 and local in low) or (len(name) >= 4 and name.lower() in low):
        return "Don't use your name or email in the password."
    return None


# ---------------------------------------------------------------- encryption at rest (TOTP secrets)

def _fernet() -> Fernet:
    key = os.environ.get("APP_ENCRYPTION_KEY") or ""
    try:
        return Fernet(key.encode())
    except Exception:
        raise RuntimeError("APP_ENCRYPTION_KEY must be a Fernet key (python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')")


def encrypt(text: str) -> str:
    return _fernet().encrypt(text.encode()).decode()


def decrypt(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return None


# ---------------------------------------------------------------- TOTP (RFC 6238, works with any authenticator app)

STEP = 30
DIGITS = 6


def new_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _hotp(secret_b32: str, counter: int) -> str:
    key = base64.b32decode(secret_b32 + "=" * (-len(secret_b32) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    o = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[o:o + 4])[0] & 0x7FFFFFFF) % (10 ** DIGITS)
    return str(code).zfill(DIGITS)


def totp_match(secret_b32: str, code: str, last_step: int, now: float | None = None) -> int | None:
    """Return the matched time step (to store, so the code can't be used again) or None.
    Accepts the current code and one step either side for clock drift."""
    code = "".join(ch for ch in str(code) if ch.isdigit())
    if len(code) != DIGITS:
        return None
    step = int((now or time.time()) // STEP)
    for s in (step, step - 1, step + 1):
        if s > last_step and hmac.compare_digest(_hotp(secret_b32, s), code):
            return s
    return None


def otpauth_uri(secret_b32: str, email: str) -> str:
    label = quote(f"Qoui Admin:{email}")
    return f"otpauth://totp/{label}?secret={secret_b32}&issuer={quote('Qoui Admin')}&algorithm=SHA1&digits={DIGITS}&period={STEP}"


# ---------------------------------------------------------------- tokens + recovery codes

def new_token() -> str:
    return secrets.token_urlsafe(32)


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def new_recovery_codes(n: int = 8) -> list[str]:
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"  # no look-alikes
    return ["-".join("".join(secrets.choice(alphabet) for _ in range(5)) for _ in range(2)) for _ in range(n)]


def normalise_recovery(code: str) -> str:
    c = "".join(ch for ch in code.lower() if ch.isalnum())
    return f"{c[:5]}-{c[5:]}" if len(c) == 10 else ""
