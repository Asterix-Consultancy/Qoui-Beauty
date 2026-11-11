"use client";

import { useCallback, useEffect, useState } from "react";
import { call, type Review } from "./api";

const LOOKS = ["", "Soft glam", "Glam", "Bridal"];
const empty = { id: 0, quote: "", name: "", service: "", visible: true };

export default function Reviews({ onAuthLost }: { onAuthLost: () => void }) {
  const [items, setItems] = useState<Review[] | null>(null);
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(async (body: Record<string, unknown> | null) => {
    const r = body
      ? await call<{ items: Review[] }>("/api/admin/testimonials", "POST", body)
      : await call<{ items: Review[] }>("/api/admin/testimonials");
    if (!r.ok) {
      if (r.status === 401) onAuthLost();
      else setMsg({ ok: false, text: r.message });
      return false;
    }
    setItems(r.items);
    return true;
  }, [onAuthLost]);

  useEffect(() => { send(null); }, [send]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await send({ op: "save", ...form, id: form.id || undefined });
    setBusy(false);
    if (ok) {
      setMsg({ ok: true, text: form.id ? "Review updated. It's live on the site within a minute." : "Review added. It's live on the site within a minute." });
      setForm(empty);
    }
  };

  return (
    <section className="adm-sec">
      <div className="adm-head"><h2>Reviews</h2></div>
      <p className="muted">Real words from real clients (ask them first). Visible reviews show on the home page automatically.</p>

      <form className="adm-panel" onSubmit={save}>
        <h3>{form.id ? "Edit review" : "Add a review"}</h3>
        <label className="bk-field">
          <span>What the client said</span>
          <textarea rows={3} maxLength={600} value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })}
            placeholder="e.g. My makeup lasted from the church to the last dance." />
        </label>
        <div className="adm-row">
          <label className="bk-field">
            <span>First name</span>
            <input maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Wanjiru" />
          </label>
          <label className="bk-field">
            <span>Look</span>
            <select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>
              {LOOKS.map((l) => <option key={l} value={l}>{l || "—"}</option>)}
            </select>
          </label>
        </div>
        <label className="bk-check">
          <input type="checkbox" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} />
          <span className="bk-check__box" aria-hidden="true" />
          <span>Show on the website</span>
        </label>
        {msg && <p className={msg.ok ? "adm-ok" : "adm-err"} role="status">{msg.text}</p>}
        <div className="adm-actions">
          <button type="submit" className="bk-btn bk-btn--small" disabled={busy || form.quote.trim().length < 3 || !form.name.trim()}>
            {form.id ? "Save changes" : "Add review"}
          </button>
          {form.id > 0 && <button type="button" className="bk-btn bk-btn--small bk-btn--ghost" onClick={() => setForm(empty)}>Cancel edit</button>}
        </div>
      </form>

      {items === null ? <div className="adm-card adm-card--skel" /> : items.length === 0 ? (
        <p className="adm-empty">No reviews yet. The section stays hidden on the website until you add one.</p>
      ) : (
        <div className="adm-list">
          {items.map((t, i) => (
            <article key={t.id} className={`adm-card${t.visible ? "" : " adm-card--hidden"}`}>
              <div className="adm-card__top">
                <span className="adm-card__id">{t.name}{t.service ? ` · ${t.service}` : ""}</span>
                <span className={`adm-status ${t.visible ? "adm-status--confirmed" : "adm-status--cancelled"}`}>{t.visible ? "On site" : "Hidden"}</span>
              </div>
              <p className="adm-quote">“{t.quote}”</p>
              <div className="adm-actions">
                <button type="button" className="adm-link" onClick={() => { setForm({ id: t.id, quote: t.quote, name: t.name, service: t.service, visible: t.visible }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                <button type="button" className="adm-link" onClick={() => send({ op: "save", ...t, visible: !t.visible })}>{t.visible ? "Hide" : "Show"}</button>
                <button type="button" className="adm-link" disabled={i === 0} onClick={() => send({ op: "move", id: t.id, dir: "up" })}>↑</button>
                <button type="button" className="adm-link" disabled={i === items.length - 1} onClick={() => send({ op: "move", id: t.id, dir: "down" })}>↓</button>
                <button type="button" className="adm-link adm-link--danger" onClick={() => window.confirm("Delete this review?") && send({ op: "delete", id: t.id })}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
