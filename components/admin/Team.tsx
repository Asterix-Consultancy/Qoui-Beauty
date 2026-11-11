"use client";

import { useCallback, useEffect, useState } from "react";
import { call, type AuditRow, type Me, type TeamUser } from "./api";

const ACTION: Record<string, string> = {
  login: "Signed in", logout: "Signed out", login_failed: "Failed sign-in", owner_created: "Owner account created",
  invite_accepted: "Accepted invite", authenticator_enabled: "Set up authenticator", password_changed: "Changed password",
  password_change_failed: "Wrong current password", recovery_codes_regenerated: "New recovery codes",
  user_invited: "Invited", user_reset: "Reset access for", user_disabled: "Disabled", user_enabled: "Re-enabled",
  sessions_revoked: "Signed out all devices of", role_changed: "Changed role:", settings_saved: "Saved settings:",
  booking_confirm: "Confirmed booking", booking_cancel: "Cancelled booking", booking_complete: "Marked done",
  booking_no_show: "Marked no-show", review_save: "Saved review", review_delete: "Deleted review", review_move: "Reordered reviews",
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }) : "never");

export default function Team({ me, onAuthLost }: { me: Me; onAuthLost: () => void }) {
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [form, setForm] = useState({ name: "", email: "", role: "staff" });
  const [link, setLink] = useState<{ who: string; url: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(async (body?: Record<string, unknown>, who?: string) => {
    setBusy(true);
    const r = body
      ? await call<{ users: TeamUser[]; audit: AuditRow[]; invite_link?: string }>("/api/admin/users", "POST", body)
      : await call<{ users: TeamUser[]; audit: AuditRow[]; invite_link?: string }>("/api/admin/users");
    setBusy(false);
    if (!r.ok) { if (r.status === 401) onAuthLost(); else setMsg({ ok: false, text: r.message }); return false; }
    setUsers(r.users);
    setAudit(r.audit);
    if (r.invite_link) setLink({ who: who ?? "", url: r.invite_link });
    return true;
  }, [onAuthLost]);

  useEffect(() => { send(); }, [send]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (await send({ op: "invite", ...form }, form.name)) setForm({ name: "", email: "", role: "staff" });
  };
  const confirmThen = (q: string, body: Record<string, unknown>, who?: string) => { if (window.confirm(q)) { setMsg(null); send(body, who); } };

  return (
    <section className="adm-sec">
      <div className="adm-head"><h2>Team</h2></div>
      <p className="muted">Everyone signs in with their own password and authenticator code. Staff can manage bookings and reviews; owners can also change settings and the team.</p>

      {link && (
        <div className="adm-panel adm-invite">
          <h3>Invite link for {link.who}</h3>
          <p className="muted">Send it privately (e.g. WhatsApp). It works once and expires in 48 hours.</p>
          <code className="adm-secret">{link.url}</code>
          <div className="adm-actions">
            <button type="button" className="bk-btn bk-btn--small" onClick={() => navigator.clipboard?.writeText(link.url)}>Copy link</button>
            <a className="bk-btn bk-btn--small bk-btn--ghost" href={`https://wa.me/?text=${encodeURIComponent(`Your Qoui admin invite (works once, 48 h): ${link.url}`)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
            <button type="button" className="adm-link" onClick={() => setLink(null)}>Done</button>
          </div>
        </div>
      )}

      <form className="adm-panel" onSubmit={invite}>
        <h3>Give someone access</h3>
        <div className="adm-row">
          <label className="bk-field"><span>Name</span><input value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="bk-field"><span>Email</span><input type="email" value={form.email} maxLength={120} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label className="bk-field"><span>Role</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="staff">Staff: bookings + reviews</option>
              <option value="owner">Owner: everything</option>
            </select></label>
        </div>
        {msg && <p className={msg.ok ? "adm-ok" : "adm-err"} role="status">{msg.text}</p>}
        <div className="adm-save"><button type="submit" className="bk-btn bk-btn--small" disabled={busy || !form.name || !form.email}>Create invite link</button></div>
      </form>

      <div className="adm-list">
        {(users ?? []).map((u) => {
          const self = u.id === me.id;
          return (
            <article key={u.id} className={`adm-card${u.status === "disabled" ? " adm-card--hidden" : ""}`}>
              <div className="adm-card__top">
                <span className="adm-card__id">{u.role === "owner" ? "Owner" : "Staff"}{self ? " · you" : ""}</span>
                <span className={`adm-status adm-status--${u.status === "active" ? "confirmed" : u.status === "invited" ? "deposit_claimed" : "cancelled"}`}>
                  {u.locked ? "Locked (too many tries)" : u.status === "active" ? "Active" : u.status === "invited" ? "Invite pending" : "Disabled"}
                </span>
              </div>
              <h3>{u.name}</h3>
              <p className="adm-card__who">{u.email}</p>
              <dl className="adm-card__grid">
                <div><dt>Last sign-in</dt><dd>{when(u.last_login_at)}</dd></div>
                <div><dt>Signed in on</dt><dd>{u.sessions} device{u.sessions === 1 ? "" : "s"}</dd></div>
                <div><dt>Password set</dt><dd>{when(u.password_changed_at)}</dd></div>
                <div><dt>Recovery codes</dt><dd>{u.totp_enabled ? `${u.recovery_left} left` : "—"}</dd></div>
              </dl>
              {!self && (
                <div className="adm-actions">
                  <button type="button" className="adm-link" disabled={busy} onClick={() => confirmThen(`Reset ${u.name}'s access? Their password and authenticator are wiped and you get a new invite link for them.`, { op: "reset", id: u.id }, u.name)}>Reset access</button>
                  <button type="button" className="adm-link" disabled={busy || u.sessions === 0} onClick={() => confirmThen(`Sign ${u.name} out on all devices?`, { op: "revoke", id: u.id })}>Sign out devices</button>
                  <button type="button" className="adm-link" disabled={busy} onClick={() => send({ op: "role", id: u.id, role: u.role === "owner" ? "staff" : "owner" })}>Make {u.role === "owner" ? "staff" : "owner"}</button>
                  {u.active
                    ? <button type="button" className="adm-link adm-link--danger" disabled={busy} onClick={() => confirmThen(`Disable ${u.name}? They're signed out immediately.`, { op: "disable", id: u.id })}>Disable</button>
                    : <button type="button" className="adm-link" disabled={busy} onClick={() => send({ op: "enable", id: u.id })}>Re-enable</button>}
                </div>
              )}
              {self && <div className="adm-actions"><button type="button" className="adm-link" disabled={busy || u.sessions < 2} onClick={() => confirmThen("Sign out your other devices?", { op: "revoke", id: u.id })}>Sign out my other devices</button></div>}
            </article>
          );
        })}
      </div>

      <div className="adm-panel">
        <h3>Activity log</h3>
        <p className="muted">Sign-ins, failed attempts and changes, newest first. &ldquo;Device&rdquo; is a scrambled network id, so you can spot repeats without storing IP addresses.</p>
        <ul className="adm-audit">
          {audit.map((a, i) => (
            <li key={i} className={a.action.includes("failed") ? "is-bad" : ""}>
              <time>{when(a.created_at)}</time>
              <span><strong>{a.user_name ?? "Someone"}</strong> {ACTION[a.action] ?? a.action} {a.detail}</span>
              <em>{a.device}</em>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
