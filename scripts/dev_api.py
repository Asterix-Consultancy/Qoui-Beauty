"""Local development only: serve the /api Python functions on http://127.0.0.1:3001.

`next dev` proxies /api/* here (see next.config.mjs), so the website and the booking flow work
on localhost exactly as on Vercel. Reads .env.local. Never used in production.

    .venv/bin/python scripts/dev_api.py
"""

from __future__ import annotations

import importlib.util
import os
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path

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

# Same router as production (api/index.py), so local dev exercises the real dispatch.
_spec = importlib.util.spec_from_file_location("api_index", API / "index.py")
_index = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_index)  # type: ignore[union-attr]


class Router(_index.handler):
    def log_message(self, fmt, *args):
        sys.stderr.write("api  %s\n" % (fmt % args))


if __name__ == "__main__":
    port = int(os.environ.get("DEV_API_PORT", "3001"))
    print(f"Qoui dev API on http://127.0.0.1:{port}  (WhatsApp dry-run: {os.environ.get('WHATSAPP_DRY_RUN')})")
    ThreadingHTTPServer(("127.0.0.1", port), Router).serve_forever()
