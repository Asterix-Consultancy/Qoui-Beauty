"""Local development only: serve the /api Python functions on http://127.0.0.1:3001.

`next dev` proxies /api/* here (see next.config.mjs), so the website and the booking flow work
on localhost exactly as on Vercel. Reads .env.local. Never used in production.

    .venv/bin/python scripts/dev_api.py
"""

from __future__ import annotations

import importlib.util
import os
import sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
API = ROOT / "api"


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env(ROOT / ".env.local")
os.environ.setdefault("WHATSAPP_DRY_RUN", "1")
sys.path.insert(0, str(API))

_handlers: dict[str, type] = {}


def handler_for(route: str) -> type | None:
    """/api/cron/reminders -> api/cron/reminders.py:handler"""
    rel = route.removeprefix("/api/").strip("/")
    if not rel or ".." in rel or rel.startswith("_"):
        return None
    file = API / f"{rel}.py"
    if not file.is_file():
        return None
    if rel not in _handlers:
        spec = importlib.util.spec_from_file_location(f"api_{rel.replace('/', '_')}", file)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        _handlers[rel] = mod.handler
    return _handlers[rel]


class Router(BaseHTTPRequestHandler):
    def _dispatch(self):
        cls = handler_for(urlparse(self.path).path)
        if cls is None:
            self.send_error(404)
            return
        # Re-use this connection's socket with the function's handler class.
        h = cls.__new__(cls)
        h.__dict__.update(self.__dict__)
        getattr(h, f"do_{self.command}", lambda: self.send_error(405))()

    do_GET = do_POST = do_DELETE = do_OPTIONS = _dispatch

    def log_message(self, fmt, *args):
        sys.stderr.write("api  %s\n" % (fmt % args))


if __name__ == "__main__":
    port = int(os.environ.get("DEV_API_PORT", "3001"))
    print(f"Qoui dev API on http://127.0.0.1:{port}  (WhatsApp dry-run: {os.environ.get('WHATSAPP_DRY_RUN')})")
    ThreadingHTTPServer(("127.0.0.1", port), Router).serve_forever()
