"""/api/admin/testimonials
GET  -> all testimonials (including hidden)
POST {op: save|delete|move, ...}
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _lib import db  # noqa: E402
from _lib.admin_auth import AdminHandler, audit  # noqa: E402
from _lib.http import safe  # noqa: E402

SERVICES = ("", "Soft glam", "Glam", "Bridal")


def all_items() -> list[dict]:
    return [
        {"id": r["id"], "quote": r["quote"], "name": r["name"], "service": r["service"], "visible": r["visible"], "sort": r["sort"]}
        for r in db.all_("SELECT * FROM testimonials ORDER BY sort, id")
    ]


class handler(AdminHandler):
    @safe
    def do_GET(self):
        if not self.require():
            return
        self.send_json(200, {"ok": True, "items": all_items()})

    @safe
    def do_POST(self):
        me = self.require(post=True)
        if not me:
            return
        d = self.body() or {}
        op = d.get("op")
        if op in ("save", "delete", "move"):
            audit(me["id"], f"review_{op}", str(d.get("name") or d.get("id") or ""), self.ip_h())
        if op == "save":
            quote = str(d.get("quote", "")).strip()
            name = str(d.get("name", "")).strip()
            service = str(d.get("service", "")).strip()
            if not 3 <= len(quote) <= 600:
                return self.error(400, "quote", "Write the client's words (up to 600 characters).")
            if not 1 <= len(name) <= 60:
                return self.error(400, "name", "Add the client's first name.")
            if service not in SERVICES:
                return self.error(400, "service", "Pick a look.")
            visible = bool(d.get("visible", True))
            if d.get("id"):
                ok = db.one("UPDATE testimonials SET quote=%s, name=%s, service=%s, visible=%s WHERE id=%s RETURNING id",
                            (quote, name, service, visible, int(d["id"])))
                if not ok:
                    return self.error(404, "missing", "That review was deleted.")
            else:
                db.one("INSERT INTO testimonials (quote, name, service, visible, sort) "
                       "VALUES (%s, %s, %s, %s, COALESCE((SELECT max(sort) + 1 FROM testimonials), 0)) RETURNING id",
                       (quote, name, service, visible))
        elif op == "delete":
            db.one("DELETE FROM testimonials WHERE id = %s RETURNING id", (int(d.get("id", 0)),))
        elif op == "move":
            items = all_items()
            ids = [i["id"] for i in items]
            tid, step = int(d.get("id", 0)), (-1 if d.get("dir") == "up" else 1)
            if tid in ids:
                i = ids.index(tid)
                j = i + step
                if 0 <= j < len(ids):
                    ids[i], ids[j] = ids[j], ids[i]
                    with db.tx() as c:
                        for pos, x in enumerate(ids):
                            c.execute("UPDATE testimonials SET sort = %s WHERE id = %s", (pos, x))
        else:
            return self.error(400, "op", "Unknown action.")
        self.send_json(200, {"ok": True, "items": all_items()})
