"use client";

import { useCallback, useEffect, useState } from "react";
import { call, DAYS, type Settings } from "./api";

type Status = { ok: boolean; text: string } | null;

export default function SettingsPanel({ onAuthLost }: { onAuthLost: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const apply = useCallback((r: Awaited<ReturnType<typeof call<Settings>>>, key: string, okText: string) => {
    if (!r.ok) {
      if (r.status === 401) onAuthLost();
      setStatus((x) => ({ ...x, [key]: { ok: false, text: r.message } }));
      return;
    }
    const { ok: _ok, ...rest } = r;
    void _ok;
    setS(rest as Settings);
    setStatus((x) => ({ ...x, [key]: { ok: true, text: okText } }));
    setTimeout(() => setStatus((x) => ({ ...x, [key]: null })), 4000);
  }, [onAuthLost]);

  useEffect(() => {
    call<Settings>("/api/admin/settings").then((r) => {
      if (r.ok) { const { ok: _o, ...rest } = r; void _o; setS(rest as Settings); }
      else if (r.status === 401) onAuthLost();
    });
  }, [onAuthLost]);

  const save = async (section: string, body: Record<string, unknown>) => {
    setBusy(section);
    const r = await call<Settings>("/api/admin/settings", "POST", { section, ...body });
    setBusy(null);
    apply(r, section, "Saved. The website and booking calendar use it straight away.");
  };

  if (!s) return <section className="adm-sec"><div className="adm-card adm-card--skel" /></section>;

  const setRule = (k: string, v: number) => setS({ ...s, rules: { ...s.rules, [k]: v } });
  const setText = (k: string, v: string) => setS({ ...s, texts: { ...s.texts, [k]: v } });
  const Save = ({ k, onClick }: { k: string; onClick: () => void }) => (
    <div className="adm-save">
      {status[k] && <span className={status[k]!.ok ? "adm-ok" : "adm-err"} role="status">{status[k]!.text}</span>}
      <button type="button" className="bk-btn bk-btn--small" disabled={busy === k} onClick={onClick}>{busy === k ? "Saving…" : "Save"}</button>
    </div>
  );

  return (
    <section className="adm-sec">
      <div className="adm-head"><h2>Settings</h2></div>

      <div className="adm-panel">
        <h3>Looks, prices and durations</h3>
        <p className="muted">How long each look takes decides which times show as free.</p>
        {s.services.map((x, i) => (
          <div key={x.code} className={`adm-svc${x.active ? "" : " is-off"}`}>
            <div className="adm-row">
              <label className="bk-field"><span>Name</span>
                <input value={x.name} maxLength={40} onChange={(e) => { const v = [...s.services]; v[i] = { ...x, name: e.target.value }; setS({ ...s, services: v }); }} /></label>
              <label className="bk-field"><span>Price (KES)</span>
                <input type="number" inputMode="numeric" min={0} step={100} value={x.price_kes} onChange={(e) => { const v = [...s.services]; v[i] = { ...x, price_kes: Number(e.target.value) }; setS({ ...s, services: v }); }} /></label>
              <label className="bk-field"><span>Takes</span>
                <select value={x.duration_min} onChange={(e) => { const v = [...s.services]; v[i] = { ...x, duration_min: Number(e.target.value) }; setS({ ...s, services: v }); }}>
                  {Array.from({ length: 20 }, (_, k) => (k + 2) * 15).map((m) => <option key={m} value={m}>{m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`}</option>)}
                </select></label>
            </div>
            <label className="bk-field"><span>What&apos;s included</span>
              <textarea rows={2} maxLength={400} value={x.description} onChange={(e) => { const v = [...s.services]; v[i] = { ...x, description: e.target.value }; setS({ ...s, services: v }); }} /></label>
            <label className="bk-check">
              <input type="checkbox" checked={x.active} onChange={(e) => { const v = [...s.services]; v[i] = { ...x, active: e.target.checked }; setS({ ...s, services: v }); }} />
              <span className="bk-check__box" aria-hidden="true" /><span>Offer this look</span>
            </label>
          </div>
        ))}
        <Save k="services" onClick={() => save("services", { services: s.services })} />
      </div>

      <div className="adm-panel">
        <h3>Opening hours</h3>
        <div className="adm-hours">
          {s.hours.map((h, i) => (
            <div key={h.weekday} className={`adm-day${h.open ? "" : " is-off"}`}>
              <label className="switch">
                <input type="checkbox" checked={h.open} onChange={(e) => { const v = [...s.hours]; v[i] = { ...h, open: e.target.checked }; setS({ ...s, hours: v }); }} />
                <span className="switch__track" aria-hidden="true" />
                <span className="adm-day__name">{DAYS[h.weekday]}</span>
              </label>
              {h.open ? (
                <span className="adm-day__times">
                  <input type="time" step={1800} value={h.start} aria-label={`${DAYS[h.weekday]} opens`} onChange={(e) => { const v = [...s.hours]; v[i] = { ...h, start: e.target.value }; setS({ ...s, hours: v }); }} />
                  <span>to</span>
                  <input type="time" step={1800} value={h.end} aria-label={`${DAYS[h.weekday]} closes`} onChange={(e) => { const v = [...s.hours]; v[i] = { ...h, end: e.target.value }; setS({ ...s, hours: v }); }} />
                </span>
              ) : <span className="muted">Closed</span>}
            </div>
          ))}
        </div>
        <Save k="hours" onClick={() => save("hours", { hours: s.hours })} />
      </div>

      <DaysOff s={s} onSaved={(r) => apply(r, "days_off", "Updated.")} status={status.days_off ?? null} />

      <div className="adm-panel">
        <h3>Booking rules</h3>
        <div className="adm-grid">
          <Num label="Deposit to hold a slot (KES)" v={s.rules.deposit_amount} step={100} on={(v) => setRule("deposit_amount", v)} />
          <Num label="House call fee (KES)" v={s.rules.house_call_fee} step={100} on={(v) => setRule("house_call_fee", v)} />
          <Num label="Travel time before & after a house call (min)" v={s.rules.travel_buffer_min} step={15} on={(v) => setRule("travel_buffer_min", v)} />
          <Num label="Minimum notice (hours)" v={Math.round(s.rules.min_lead_min / 60)} step={1} on={(v) => setRule("min_lead_min", v * 60)} />
          <Num label="Hold unpaid bookings for (hours)" v={s.rules.pending_hold_hours} step={1} on={(v) => setRule("pending_hold_hours", v)} />
          <Num label="Clients can book up to (days ahead)" v={s.rules.max_days_ahead} step={7} on={(v) => setRule("max_days_ahead", v)} />
          <label className="bk-field"><span>Start times every</span>
            <select value={s.rules.slot_step_min} onChange={(e) => setRule("slot_step_min", Number(e.target.value))}>
              {[15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select></label>
        </div>
        <Save k="rules" onClick={() => save("rules", { rules: s.rules })} />
      </div>

      <div className="adm-panel">
        <h3>M-Pesa for deposits</h3>
        <p className="muted">Shown to clients on the booking confirmation screen.</p>
        <div className="adm-row">
          <label className="bk-field"><span>M-Pesa number</span>
            <input inputMode="tel" value={s.texts.mpesa_number} maxLength={16} placeholder="0712 345 678" onChange={(e) => setText("mpesa_number", e.target.value)} /></label>
          <label className="bk-field"><span>Name on M-Pesa</span>
            <input value={s.texts.mpesa_name} maxLength={60} placeholder="As it appears when clients pay" onChange={(e) => setText("mpesa_name", e.target.value)} /></label>
        </div>
        <Save k="payment" onClick={() => save("payment", { texts: { mpesa_number: s.texts.mpesa_number, mpesa_name: s.texts.mpesa_name } })} />
      </div>

      <div className="adm-panel">
        <h3>Studio address</h3>
        <label className="bk-field"><span>Address</span>
          <input value={s.texts.studio_address} maxLength={200} onChange={(e) => setText("studio_address", e.target.value)} /></label>
        <label className="bk-field"><span>Directions for clients</span>
          <textarea rows={3} maxLength={500} value={s.texts.studio_directions} placeholder="e.g. Opposite Donholm Total petrol station, 2nd floor, door 4." onChange={(e) => setText("studio_directions", e.target.value)} /></label>
        <Save k="studio" onClick={() => save("studio", { texts: { studio_address: s.texts.studio_address, studio_directions: s.texts.studio_directions } })} />
      </div>

      <div className="adm-panel">
        <h3>WhatsApp numbers</h3>
        <p className="muted">The studio number is used by every WhatsApp button and shown on the website. Changes apply straight away.</p>
        <div className="adm-row">
          <label className="bk-field"><span>Studio WhatsApp (clients message this)</span>
            <input inputMode="tel" value={s.texts.whatsapp_number} maxLength={20} placeholder="0727 509 719" onChange={(e) => setText("whatsapp_number", e.target.value)} /></label>
          <label className="bk-field"><span>Booking alerts go to (when WhatsApp alerts are on)</span>
            <input inputMode="tel" value={s.texts.alert_whatsapp} maxLength={20} placeholder="Betty's own number" onChange={(e) => setText("alert_whatsapp", e.target.value)} /></label>
        </div>
        <Save k="whatsapp" onClick={() => save("whatsapp", { texts: { whatsapp_number: s.texts.whatsapp_number, alert_whatsapp: s.texts.alert_whatsapp } })} />
      </div>

      <div className="adm-panel">
        <h3>Admin security</h3>
        <p className="muted">Applies to everyone with admin access.</p>
        <div className="adm-grid">
          <Num label="Passwords must be changed every (days)" v={s.rules.password_max_age_days} step={15} on={(v) => setRule("password_max_age_days", v)} />
          <Num label="Sign out after inactivity (minutes)" v={s.rules.session_idle_min} step={5} on={(v) => setRule("session_idle_min", v)} />
          <Num label="Sign out after, no matter what (hours)" v={s.rules.session_max_hours} step={1} on={(v) => setRule("session_max_hours", v)} />
        </div>
        <Save k="security" onClick={() => save("rules", { rules: { password_max_age_days: s.rules.password_max_age_days, session_idle_min: s.rules.session_idle_min, session_max_hours: s.rules.session_max_hours } }).then(() => setStatus((x) => ({ ...x, security: x.rules ?? null })))} />
      </div>
    </section>
  );
}

function Num({ label, v, step, on }: { label: string; v: number; step: number; on: (v: number) => void }) {
  return (
    <label className="bk-field"><span>{label}</span>
      <input type="number" inputMode="numeric" min={0} step={step} value={Number.isFinite(v) ? v : 0} onChange={(e) => on(Number(e.target.value))} />
    </label>
  );
}

function DaysOff({ s, onSaved, status }: { s: Settings; onSaved: (r: Awaited<ReturnType<typeof call<Settings>>>) => void; status: Status }) {
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const post = async (op: "add" | "remove", d: string) => {
    const r = await call<Settings>("/api/admin/settings", "POST", { section: "days_off", op, day: d, reason });
    onSaved(r);
    if (r.ok && op === "add") { setDay(""); setReason(""); }
  };
  return (
    <div className="adm-panel">
      <h3>Days off</h3>
      <p className="muted">No bookings are offered on these days. Existing bookings stay; cancel them in Bookings if needed.</p>
      <div className="adm-row adm-row--end">
        <label className="bk-field"><span>Date</span><input type="date" min={today} value={day} onChange={(e) => setDay(e.target.value)} /></label>
        <label className="bk-field"><span>Reason (only you see this)</span><input value={reason} maxLength={100} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family event" /></label>
        <button type="button" className="bk-btn bk-btn--small" disabled={!day} onClick={() => post("add", day)}>Add day off</button>
      </div>
      {status && <p className={status.ok ? "adm-ok" : "adm-err"} role="status">{status.text}</p>}
      {s.days_off.length > 0 && (
        <ul className="adm-off">
          {s.days_off.map((d) => (
            <li key={d.day}>
              <span><strong>{new Date(d.day + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</strong>{d.reason && ` · ${d.reason}`}</span>
              <button type="button" className="adm-link adm-link--danger" onClick={() => post("remove", d.day)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
