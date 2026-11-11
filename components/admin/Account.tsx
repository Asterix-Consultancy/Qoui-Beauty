"use client";

import { useState } from "react";
import { PasswordFields } from "./Auth";
import { call, type Me } from "./api";

export default function Account({ me, onChanged, onAuthLost, forced = false }: {
  me: Me; onChanged: () => void; onAuthLost: () => void; forced?: boolean;
}) {
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await call("/api/admin/auth", "POST", { op: "change_password", current: cur, new: pw });
    setBusy(false);
    if (!r.ok) { if (r.status === 401) onAuthLost(); else setMsg({ ok: false, text: r.message }); return; }
    setCur(""); setPw(""); setPw2("");
    setMsg({ ok: true, text: "Password changed. Other devices were signed out." });
    onChanged();
  };

  const regen = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await call<{ recovery_codes: string[] }>("/api/admin/auth", "POST", { op: "recovery_regen", code });
    setCode("");
    if (r.ok) setCodes(r.recovery_codes); else if (r.status === 401) onAuthLost(); else setMsg({ ok: false, text: r.message });
  };

  const form = (
    <form className="adm-form" onSubmit={change}>
      <label className="bk-field"><span>Current password</span>
        <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required maxLength={128} /></label>
      <PasswordFields pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
      {msg && <p className={msg.ok ? "adm-ok" : "adm-err"} role="status">{msg.text}</p>}
      <button type="submit" className="bk-btn" disabled={busy || !cur || pw.length < 12 || pw !== pw2}>{busy ? "Saving…" : "Change password"}</button>
    </form>
  );
  if (forced) return form;

  return (
    <section className="adm-sec">
      <div className="adm-head"><h2>My account</h2></div>
      <div className="adm-panel">
        <h3>{me.name}</h3>
        <p className="muted">{me.email} · {me.role === "owner" ? "Owner" : "Staff"}{me.password_days_left !== null && ` · password expires in ${me.password_days_left} days`}</p>
      </div>
      <div className="adm-panel">
        <h3>Change password</h3>
        {form}
      </div>
      <div className="adm-panel">
        <h3>Recovery codes</h3>
        <p className="muted">Used some, or think someone saw them? Make a fresh set (the old ones stop working).</p>
        {codes ? (
          <>
            <ul className="adm-codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
            <p className="adm-ok">Save these now. You won&apos;t see them again.</p>
          </>
        ) : (
          <form className="adm-row adm-row--end" onSubmit={regen}>
            <label className="bk-field"><span>Current 6-digit code</span>
              <input className="adm-code adm-code--sm" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} /></label>
            <button type="submit" className="bk-btn bk-btn--small" disabled={code.length !== 6}>New recovery codes</button>
          </form>
        )}
      </div>
    </section>
  );
}
