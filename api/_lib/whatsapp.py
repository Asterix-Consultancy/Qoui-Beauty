"""Meta WhatsApp Business Cloud API (Graph API): send, download media, verify webhooks."""

from __future__ import annotations

import hashlib
import hmac
import os
import re

import httpx

from .config import env, log, mask_phone

# Error code Meta returns when a free-form message is sent outside the 24-hour window.
OUTSIDE_WINDOW_CODES = {131047}

_client: httpx.Client | None = None


class WhatsAppError(Exception):
    def __init__(self, code: int | None, message: str):
        super().__init__(f"WhatsApp error {code}: {message}")
        self.code = code


def _http() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=httpx.Timeout(15.0, connect=5.0))
    return _client


def _graph() -> str:
    return f"https://graph.facebook.com/{env('GRAPH_API_VERSION', 'v21.0')}"


def _auth() -> dict:
    return {"Authorization": f"Bearer {env('WHATSAPP_TOKEN')}"}


def _send(payload: dict) -> str | None:
    payload = {"messaging_product": "whatsapp", "recipient_type": "individual", **payload}
    if os.environ.get("WHATSAPP_DRY_RUN") == "1":  # local development: log instead of sending
        body = payload.get("text", {}).get("body") or payload.get("type")
        log.info("[dry-run] WhatsApp to %s: %s", mask_phone(payload.get("to", "")), str(body)[:200])
        return None
    r = _http().post(f"{_graph()}/{env('WHATSAPP_PHONE_NUMBER_ID')}/messages", headers=_auth(), json=payload)
    data = r.json() if r.content else {}
    if r.status_code >= 400 or "error" in data:
        err = data.get("error", {})
        code = err.get("code")
        log.warning("WhatsApp send to %s failed: %s %s", mask_phone(payload.get("to", "")), code, err.get("message"))
        raise WhatsAppError(code, err.get("message", r.text[:200]))
    msgs = data.get("messages") or [{}]
    return msgs[0].get("id")


# ---------------------------------------------------------------- send

def send_text(to: str, body: str) -> str | None:
    return _send({"to": to, "type": "text", "text": {"body": body[:4096], "preview_url": False}})


def send_buttons(to: str, body: str, options: list[str]) -> str | None:
    """Interactive reply buttons (max 3, title max 20 chars). The tapped title comes back as the reply."""
    buttons = []
    seen = set()
    for opt in options[:3]:
        title = opt.strip()[:20]
        if title and title not in seen:
            seen.add(title)
            buttons.append({"type": "reply", "reply": {"id": title, "title": title}})
    if not buttons:
        return send_text(to, body)
    return _send({
        "to": to,
        "type": "interactive",
        "interactive": {"type": "button", "body": {"text": body[:1024]}, "action": {"buttons": buttons}},
    })


def template_param(text: str) -> str:
    """Meta rejects template parameters with newlines, tabs or 4+ consecutive spaces."""
    text = re.sub(r"[\r\n\t]+", " · ", str(text))
    text = re.sub(r" {4,}", "   ", text)
    return text.strip()[:1000] or "-"


def send_template(to: str, name: str, params: list[str], lang: str | None = None) -> str | None:
    components = []
    if params:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": template_param(p)} for p in params],
        })
    return _send({
        "to": to,
        "type": "template",
        "template": {"name": name, "language": {"code": lang or env("TEMPLATE_LANG", "en")}, "components": components},
    })


def send_text_or_template(to: str, body: str, template: str, params: list[str]) -> str | None:
    """Free-form if the 24-hour window is open; otherwise fall back to an approved template."""
    try:
        return send_text(to, body)
    except WhatsAppError as e:
        if e.code in OUTSIDE_WINDOW_CODES:
            return send_template(to, template, params)
        raise


def mark_read(message_id: str) -> None:
    try:
        _send({"status": "read", "message_id": message_id})
    except Exception:  # cosmetic only
        pass


# ---------------------------------------------------------------- media

MAX_MEDIA_BYTES = 5 * 1024 * 1024  # Claude's per-image limit


def download_media(media_id: str) -> tuple[bytes, str]:
    """Returns (bytes, mime_type). Kept in memory only - never written to disk or the database."""
    meta = _http().get(f"{_graph()}/{media_id}", headers=_auth())
    meta.raise_for_status()
    info = meta.json()
    if int(info.get("file_size") or 0) > MAX_MEDIA_BYTES:
        raise WhatsAppError(None, "media too large")
    blob = _http().get(info["url"], headers=_auth())
    blob.raise_for_status()
    if len(blob.content) > MAX_MEDIA_BYTES:
        raise WhatsAppError(None, "media too large")
    return blob.content, (info.get("mime_type") or "image/jpeg").split(";")[0]


# ---------------------------------------------------------------- webhook security

def verify_signature(raw_body: bytes, header: str | None) -> bool:
    if not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(env("WHATSAPP_APP_SECRET").encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.removeprefix("sha256="))
