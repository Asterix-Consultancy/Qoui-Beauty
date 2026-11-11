"""WhatsApp webhook.

GET  /api/whatsapp  - Meta verification handshake
POST /api/whatsapp  - incoming messages (signed by Meta)

Processing happens before the 200 is returned (serverless functions freeze after the
response). That is safe because every message id is claimed in the database first: if
Meta retries while we're still working, or later, the retry is skipped.
"""

from __future__ import annotations

import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib import betty_commands, claude_agent, db, notify, tools  # noqa: E402
from _lib.config import betty_phone, digits, log, mask_phone  # noqa: E402
from _lib import whatsapp as wa  # noqa: E402

PRIVACY_LINE = "We only use your details for your bookings."
FALLBACK = "Sorry, something went wrong on my side. Betty will reply here shortly."
MAX_AGE_SECONDS = 60 * 60  # ignore messages older than an hour (Meta replays after outages)

UNSUPPORTED = {
    "audio": "I can't listen to voice notes yet. Could you type your question? Or I can ask Betty to get back to you.",
    "video": "I can't watch videos yet. Could you send a photo or type your question?",
    "sticker": "Haha, love it. How can I help? I can share prices, suggest a look or book you in.",
    "document": "I can't open documents yet. Could you send a photo or type your question?",
    "contacts": "Thanks! How can I help? I can share prices, suggest a look or book you in.",
}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        mode = q.get("hub.mode", [""])[0]
        token = q.get("hub.verify_token", [""])[0]
        challenge = q.get("hub.challenge", [""])[0]
        if mode == "subscribe" and token and token == os.environ.get("WHATSAPP_VERIFY_TOKEN"):
            self._send(200, challenge, "text/plain")
        else:
            self._send(403, "Forbidden", "text/plain")

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if not wa.verify_signature(raw, self.headers.get("X-Hub-Signature-256")):
            log.warning("Rejected webhook with bad signature")
            self._send(401, "Bad signature", "text/plain")
            return
        try:
            payload = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            self._send(400, "Bad JSON", "text/plain")
            return

        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for msg in value.get("messages", []) or []:
                    try:
                        process(msg, value.get("contacts", []))
                    except Exception:
                        log.exception("Unhandled error processing message")
        # Delivery/read statuses are ignored in v1.
        self._send(200, "OK", "text/plain")

    def _send(self, status: int, body: str, ctype: str):
        data = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):  # silence default access log (contains query strings)
        pass


def extract(msg: dict) -> tuple[str, str | None]:
    """(type, text) for logging and for the assistant."""
    t = msg.get("type", "unknown")
    if t == "text":
        return t, msg.get("text", {}).get("body", "")
    if t == "interactive":
        i = msg.get("interactive", {})
        reply = i.get("button_reply") or i.get("list_reply") or {}
        return t, reply.get("title", "")
    if t == "button":  # quick-reply button on a template message
        return t, msg.get("button", {}).get("text", "")
    if t == "image":
        return t, msg.get("image", {}).get("caption", "") or None
    if t == "location":
        loc = msg.get("location", {})
        parts = [loc.get("name"), loc.get("address")]
        label = ", ".join(p for p in parts if p) or "pin"
        return t, f"[Shared location: {label} ({loc.get('latitude')}, {loc.get('longitude')})]"
    return t, None


def process(msg: dict, contacts: list) -> None:
    wa_id = msg.get("id")
    sender = digits(msg.get("from", ""))
    if not wa_id or not sender:
        return
    if msg.get("type") in ("reaction", "system", "ephemeral"):
        return  # nothing to answer
    try:
        if time.time() - int(msg.get("timestamp", "0")) > MAX_AGE_SECONDS:
            log.info("Skipping stale message from %s", mask_phone(sender))
            return
    except ValueError:
        pass

    mtype, text = extract(msg)

    # ---------------- Betty
    if sender == betty_phone():
        if not db.claim_inbound(wa_id, None, mtype, text):
            return
        reply = betty_commands.handle(text or "")
        wa.send_text(sender, reply)
        db.log_outbound(None, None, "text", reply)
        return

    # ---------------- Client
    client, is_new = db.get_or_create_client(sender)
    log_body = text if mtype != "image" else f"[photo] {text or ''}".strip()
    if not db.claim_inbound(wa_id, client["id"], mtype, log_body):
        return  # duplicate delivery
    wa.mark_read(wa_id)

    try:
        if mtype in UNSUPPORTED or (mtype not in ("text", "interactive", "button", "image", "location")):
            reply = claude_agent.Reply(UNSUPPORTED.get(mtype, "Sorry, I can't read that type of message. Could you type it?"))
        else:
            image = None
            if mtype == "image":
                try:
                    image = wa.download_media(msg["image"]["id"])
                except Exception:
                    log.warning("Image download failed")
                    reply = claude_agent.Reply("I couldn't open that photo. Could you send it again?")
                    _deliver(sender, client["id"], reply, is_new)
                    return
            ctx = tools.Ctx(client=client, phone=sender, last_message=text or "[photo]")
            reply = claude_agent.respond(ctx, wa_id, text or "", image)
            image = None  # drop the bytes as soon as Claude has seen them
        _deliver(sender, client["id"], reply, is_new)
    except Exception:
        log.exception("Client flow failed for %s", mask_phone(sender))
        try:
            wa.send_text(sender, FALLBACK)
            db.log_outbound(None, client["id"], "text", FALLBACK)
        except Exception:
            log.exception("Fallback send failed")
        notify.betty(f"Assistant error while replying to +{sender}. Please check their chat and reply directly.")


def _deliver(to: str, client_id: int, reply: "claude_agent.Reply", is_new: bool) -> None:
    text = reply.text.strip()
    if is_new:
        text = f"{text}\n\n{PRIVACY_LINE}"
    if reply.buttons:
        wa_id = wa.send_buttons(to, text, reply.buttons)
        db.log_outbound(wa_id, client_id, "interactive", f"{text}\n[buttons: {' | '.join(reply.buttons)}]")
    else:
        wa_id = wa.send_text(to, text)
        db.log_outbound(wa_id, client_id, "text", text)


# Fail fast on misconfiguration at cold start, without printing secrets.
for _name in ("WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "DATABASE_URL", "BETTY_PHONE"):
    if not os.environ.get(_name):
        log.error("Environment variable %s is not set", _name)
