"""The one Vercel function behind every /api/* route.

vercel.json rewrites /api/(.*) here (the Hobby plan allows 12 functions per deployment).
Each route lives in api/_routes/<path>.py with its own `handler` class, e.g.
/api/admin/auth -> api/_routes/admin/auth.py. Underscore folders are not deployed as
functions. A route's module is imported the first time it is requested.
"""

from __future__ import annotations

import importlib.util
import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

API = Path(__file__).resolve().parent
ROUTES_DIR = API / "_routes"
if str(API) not in sys.path:
    sys.path.insert(0, str(API))

# Only real files under _routes can be reached; anything else is a 404.
ROUTES = {
    p.relative_to(ROUTES_DIR).with_suffix("").as_posix()
    for p in ROUTES_DIR.rglob("*.py")
    if not any(part.startswith("_") for part in p.relative_to(ROUTES_DIR).parts)
}
_handlers: dict[str, type] = {}


def handler_for(path: str) -> type | None:
    """'/api/cron/reminders?x=1' -> api/_routes/cron/reminders.py:handler"""
    rel = urlparse(path).path.removeprefix("/api/").strip("/")
    if rel not in ROUTES:
        return None
    if rel not in _handlers:
        spec = importlib.util.spec_from_file_location(f"api_route_{rel.replace('/', '_')}", ROUTES_DIR / f"{rel}.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        _handlers[rel] = mod.handler
    return _handlers[rel]


class handler(BaseHTTPRequestHandler):
    def _dispatch(self):
        cls = handler_for(self.path)
        if cls is None:
            self.send_error(404)
            return
        method = getattr(cls, f"do_{self.command}", None)
        if method is None:
            self.send_error(405)
            return
        # Hand this request (socket, parsed headers, body stream) to the route's handler class.
        h = cls.__new__(cls)
        h.__dict__.update(self.__dict__)
        method(h)
        self.close_connection = h.close_connection

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_HEAD = _dispatch

    def log_message(self, *args):  # no access logs (they would contain personal data)
        pass
