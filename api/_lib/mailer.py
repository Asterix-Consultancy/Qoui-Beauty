"""Sending email (sign-in codes) over SMTP. Standard library only.

Configure in Vercel: SMTP_HOST, SMTP_PORT (465 = SSL, 587 = STARTTLS), SMTP_USER, SMTP_PASSWORD, SMTP_FROM.
Simplest: the studio Gmail with an app password (smtp.gmail.com, 465).
Local development without SMTP: EMAIL_DRY_RUN=1 logs instead of sending.
"""

from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from .config import log


def configured() -> bool:
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER") and os.environ.get("SMTP_PASSWORD"))


def dry_run() -> bool:
    return os.environ.get("EMAIL_DRY_RUN") == "1" and not configured()


def available() -> bool:
    return configured() or dry_run()


def mask(email: str) -> str:
    local, _, domain = email.partition("@")
    return (local[:2] + "•" * max(1, len(local) - 2)) + "@" + domain


def send(to: str, subject: str, text: str, html: str | None = None) -> None:
    if dry_run():
        log.info("[email dry-run] to %s: %s", mask(to), subject)
        return
    if not configured():
        raise RuntimeError("Email is not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD).")
    sender = os.environ.get("SMTP_FROM") or formataddr(("Qoui Glam Studio", os.environ["SMTP_USER"]))
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=(os.environ["SMTP_USER"].split("@")[-1] or "qoui.local"))
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    host, port = os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT") or 465)
    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as s:
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=15) as s:
            s.starttls(context=ctx)
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
            s.send_message(msg)


def send_code(to: str, name: str, code: str, purpose: str) -> None:
    first = (name or "there").split(" ")[0]
    what = "finish setting up 2-step sign-in" if purpose == "enroll" else "sign in to Qoui Admin"
    text = (f"Hi {first},\n\nYour code to {what} is: {code}\n\nIt works once and expires in 10 minutes.\n"
            "If this wasn't you, change your password now and tell the studio owner.\n\n– Qoui Glam Studio")
    html = f"""<div style="font-family:Arial,sans-serif;max-width:460px;margin:auto;color:#2B1E1A">
  <p style="font-size:15px">Hi {first},</p>
  <p style="font-size:15px">Your code to {what}:</p>
  <p style="font-size:34px;letter-spacing:8px;font-weight:bold;background:#F7F3EE;padding:16px;text-align:center;border-radius:14px">{code}</p>
  <p style="font-size:13px;color:#6E5E57">It works once and expires in 10 minutes. If this wasn't you, change your password now and tell the studio owner.</p>
  <p style="font-size:13px;color:#6E5E57">– Qoui Glam Studio</p></div>"""
    send(to, f"Your Qoui Admin code: {code}", text, html)
