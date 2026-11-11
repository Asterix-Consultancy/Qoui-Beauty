"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Logo from "../Logo";
import Account from "./Account";
import { AuthScreens, type AuthStart } from "./Auth";
import Bookings from "./Bookings";
import Reviews from "./Reviews";
import SettingsPanel from "./Settings";
import Team from "./Team";
import { call, type Me } from "./api";

type Tab = "bookings" | "reviews" | "settings" | "team" | "account";

export default function AdminApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [start, setStart] = useState<AuthStart | null>(null);
  const [tab, setTab] = useState<Tab>("bookings");
  const [badge, setBadge] = useState(0);

  const invite = useRef<string | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (invite.current === undefined) {
      // Read the invite token once, then drop it from the address bar (keeps it out of history/Referer).
      invite.current = new URLSearchParams(window.location.search).get("invite");
      if (invite.current) window.history.replaceState(null, "", "/admin");
    }
    if (invite.current) {
      setStart({ kind: "invite", token: invite.current });
      return;
    }
    const r = await call<{ state: string; user?: Me }>("/api/admin/auth");
    if (!r.ok) { setStart({ kind: "signin" }); return; }
    if (r.state === "signed_in" && r.user) { setMe(r.user); setStart(null); }
    else { setMe(null); setStart({ kind: r.state === "bootstrap" ? "bootstrap" : "signin" }); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { document.title = badge ? `(${badge}) Qoui Admin` : "Qoui Admin"; }, [badge]);

  const onAuthLost = useCallback(() => { setMe(null); setStart({ kind: "signin" }); }, []);
  const signOut = async () => {
    await call("/api/admin/auth", "POST", { op: "logout" });
    onAuthLost();
  };

  if (!me && !start) return <div className="adm adm--center"><span className="bk-spin bk-spin--dark" aria-label="Loading" /></div>;
  if (!me) return <AuthScreens start={start!} onSignedIn={() => { invite.current = null; refresh(); }} />;
  if (me.password_expired) {
    return (
      <div className="adm adm--center">
        <div className="adm-login adm-login--wide">
          <Logo size="md" />
          <h1>Time for a new password</h1>
          <p className="muted">For safety, passwords change regularly. Pick one you haven&apos;t used before.</p>
          <Account me={me} onChanged={refresh} onAuthLost={onAuthLost} forced />
        </div>
      </div>
    );
  }

  const tabs: [Tab, string][] = [["bookings", "Bookings"], ["reviews", "Reviews"]];
  if (me.role === "owner") tabs.push(["settings", "Settings"], ["team", "Team"]);
  tabs.push(["account", "My account"]);

  return (
    <div className="adm">
      <header className="adm-top">
        <div className="adm-top__brand"><Logo size="sm" /><span className="adm-pill">{me.role === "owner" ? "Owner" : "Staff"}</span></div>
        <nav className="adm-tabs" aria-label="Admin sections">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
              {label}{k === "bookings" && badge > 0 && <b className="adm-badge">{badge}</b>}
            </button>
          ))}
        </nav>
        <div className="adm-top__right">
          <span className="muted">{me.name}</span>
          <a href="/" target="_blank" rel="noopener noreferrer">View site ↗</a>
          <button type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>
      {me.password_days_left !== null && me.password_days_left <= 7 && (
        <p className="adm-banner">Your password expires in {me.password_days_left} day{me.password_days_left === 1 ? "" : "s"}. <button type="button" className="adm-link" onClick={() => setTab("account")}>Change it now</button></p>
      )}
      <main className="adm-main">
        {tab === "bookings" && <Bookings onCount={setBadge} onAuthLost={onAuthLost} />}
        {tab === "reviews" && <Reviews onAuthLost={onAuthLost} />}
        {tab === "settings" && me.role === "owner" && <SettingsPanel onAuthLost={onAuthLost} />}
        {tab === "team" && me.role === "owner" && <Team me={me} onAuthLost={onAuthLost} />}
        {tab === "account" && <Account me={me} onChanged={refresh} onAuthLost={onAuthLost} />}
      </main>
    </div>
  );
}
