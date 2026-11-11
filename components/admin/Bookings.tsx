"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { call, kes, type AdminBooking } from "./api";

type View = "action" | "upcoming" | "today" | "past";
const VIEWS: [View, string][] = [["action", "To confirm"], ["today", "Today"], ["upcoming", "Upcoming"], ["past", "Past"]];
const STATUS: Record<string, string> = {
  pending: "Waiting for deposit", deposit_claimed: "Deposit sent", confirmed: "Confirmed",
  cancelled: "Cancelled", completed: "Done", no_show: "No-show",
};

export default function Bookings({ onCount, onAuthLost }: { onCount: (n: number) => void; onAuthLost: () => void }) {
  const [view, setView] = useState<View>("action");
  const [items, setItems] = useState<AdminBooking[] | null>(null);
  const [counts, setCounts] = useState({ action: 0, paid: 0 });
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Record<number, { text: string; link: string | null }>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const doneRef = useRef(done);
  doneRef.current = done;

  const load = useCallback(async (v: View = viewRef.current) => {
    const r = await call<{ bookings: AdminBooking[]; counts: { action: number; paid: number } }>(`/api/admin/bookings?view=${v}`);
    if (!r.ok) {
      if (r.status === 401) return onAuthLost();
      setErr(r.message);
      return;
    }
    if (v !== viewRef.current) return;
    setErr(null);
    // Cards Betty just acted on stay visible (with their WhatsApp button) until she switches view.
    setItems((prev) => {
      const kept = (prev ?? []).filter((x) => doneRef.current[x.id] && !r.bookings.some((f) => f.id === x.id));
      return [...kept, ...r.bookings];
    });
    setCounts(r.counts);
    onCount(r.counts.action);
  }, [onAuthLost, onCount]);

  useEffect(() => { setItems(null); setDone({}); load(view); }, [view, load]);

  // Stay fresh: every 30 s and whenever Betty comes back to the tab.
  useEffect(() => {
    const id = setInterval(() => load(), 30_000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const act = async (b: AdminBooking, action: "confirm" | "cancel" | "complete" | "no_show") => {
    if (action === "cancel" && !window.confirm(`Cancel booking #${b.id} for ${b.client_name ?? "this client"}?`)) return;
    if (action === "confirm" && !b.mpesa_code && !window.confirm("No M-Pesa code yet. Confirm anyway?")) return;
    setBusy(b.id);
    const r = await call<{ booking: AdminBooking; whatsapp_link: string | null }>("/api/admin/bookings", "POST", { id: b.id, action });
    setBusy(null);
    if (!r.ok) {
      if (r.status === 401) return onAuthLost();
      setErr(r.message);
      load();
      return;
    }
    const first = (b.client_name ?? "the client").split(" ")[0];
    const text = { confirm: `Confirmed. Let ${first} know:`, cancel: `Cancelled. Let ${first} know:`, complete: "Marked as done.", no_show: "Marked as no-show." }[action];
    setDone((d) => ({ ...d, [b.id]: { text, link: r.whatsapp_link } }));
    setItems((list) => list?.map((x) => (x.id === b.id ? r.booking : x)) ?? null);
    load();
  };

  return (
    <section className="adm-sec">
      <div className="adm-head">
        <h2>Bookings</h2>
        <button type="button" className="adm-link" onClick={() => load()}>Refresh</button>
      </div>
      <div className="adm-chips" role="group" aria-label="Show">
        {VIEWS.map(([k, label]) => (
          <button key={k} type="button" className="chip" aria-pressed={view === k} onClick={() => setView(k)}>
            {label}{k === "action" && counts.action > 0 && <b className="adm-badge">{counts.action}</b>}
          </button>
        ))}
      </div>
      {err && <p className="adm-err" role="alert">{err}</p>}
      {view === "action" && counts.paid > 0 && <p className="adm-note">{counts.paid} {counts.paid === 1 ? "client has" : "clients have"} sent the deposit. Check M-Pesa, then confirm.</p>}

      {items === null ? (
        <div className="adm-list">{[0, 1, 2].map((i) => <div key={i} className="adm-card adm-card--skel" />)}</div>
      ) : items.length === 0 ? (
        <p className="adm-empty">{view === "action" ? "Nothing waiting. Nice." : "No bookings here."}</p>
      ) : (
        <div className="adm-list">
          {items.map((b) => (
            <article key={b.id} className={`adm-card adm-card--${b.status}`}>
              <div className="adm-card__top">
                <span className="adm-card__id">#{b.id}{b.source === "web" ? " · website" : b.source === "whatsapp" ? " · WhatsApp" : ""}</span>
                <span className={`adm-status adm-status--${b.status}`}>{STATUS[b.status] ?? b.status}</span>
              </div>
              <h3>{b.label}</h3>
              <p className="adm-card__who"><strong>{b.client_name ?? "No name"}</strong> · <a href={`tel:+${b.client_phone}`}>+{b.client_phone}</a></p>
              <dl className="adm-card__grid">
                <div><dt>Look</dt><dd>{b.service}</dd></div>
                <div><dt>Where</dt><dd>{b.location_type === "studio" ? "Studio" : `House call · ${b.address}`}</dd></div>
                <div><dt>Total</dt><dd>{kes(b.total_kes)}</dd></div>
                <div><dt>Deposit</dt><dd>{kes(b.deposit_kes)}</dd></div>
                <div className="adm-card__code"><dt>M-Pesa code</dt><dd>{b.mpesa_code ? <code>{b.mpesa_code}</code> : <span className="muted">Not sent yet</span>}</dd></div>
              </dl>
              {b.notes && <p className="adm-card__notes">“{b.notes}”</p>}

              {done[b.id] ? (
                <div className="adm-done">
                  <span>{done[b.id].text}</span>
                  {done[b.id].link && <a className="bk-btn bk-btn--small" href={done[b.id].link!} target="_blank" rel="noopener noreferrer">Message on WhatsApp</a>}
                </div>
              ) : (
                <div className="adm-actions">
                  {(b.status === "pending" || b.status === "deposit_claimed") && (
                    <button type="button" className="bk-btn bk-btn--small" disabled={busy === b.id} onClick={() => act(b, "confirm")}>Confirm</button>
                  )}
                  {b.status === "confirmed" && new Date(b.start_at) < new Date() && (
                    <>
                      <button type="button" className="bk-btn bk-btn--small" disabled={busy === b.id} onClick={() => act(b, "complete")}>Done</button>
                      <button type="button" className="bk-btn bk-btn--small bk-btn--ghost" disabled={busy === b.id} onClick={() => act(b, "no_show")}>No-show</button>
                    </>
                  )}
                  {["pending", "deposit_claimed", "confirmed"].includes(b.status) && (
                    <button type="button" className="bk-btn bk-btn--small bk-btn--ghost" disabled={busy === b.id} onClick={() => act(b, "cancel")}>Cancel</button>
                  )}
                  <a className="adm-link" href={`https://wa.me/${b.client_phone}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
