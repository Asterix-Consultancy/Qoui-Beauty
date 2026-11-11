"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import Logo from "../Logo";
import { call } from "./api";

export type AuthStart = { kind: "signin" } | { kind: "bootstrap" } | { kind: "invite"; token: string };
type Mode = "signin" | "master";
type Enroll = { enroll: string; email: string; email_available: boolean };
type OtpInfo = { challenge: string; method: "app" | "email"; sent_to?: string; dev_code?: string };

// Sign-in: email + password, then the 6-digit code from the authenticator app.
// Invites: set a password, scan the QR code, confirm one code, save recovery codes.
export function AuthScreens({ start, onSignedIn }: { start: AuthStart; onSignedIn: () => void }) {
  const [step, setStep] = useState<"start" | "otp" | "enroll" | "codes">("start");
  const [otp, setOtp] = useState<OtpInfo | null>(null);
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("signin");

  return (
    <div className="adm adm--center">
      <div className={`adm-login${step === "enroll" || step === "codes" ? " adm-login--wide" : ""}`}>
        <Logo size="md" />
        {step === "start" && start.kind === "signin" && mode === "signin" && <SignIn onOtp={(o) => { setOtp(o); setStep("otp"); }} onMaster={() => setMode("master")} />}
        {step === "start" && start.kind === "signin" && mode === "master" && <Bootstrap recover onBack={() => setMode("signin")} onEnroll={(e) => { setEnroll(e); setStep("enroll"); }} />}
        {step === "start" && start.kind === "bootstrap" && <Bootstrap onEnroll={(e) => { setEnroll(e); setStep("enroll"); }} />}
        {step === "start" && start.kind === "invite" && <Invite token={start.token} onEnroll={(e) => { setEnroll(e); setStep("enroll"); }} />}
        {step === "otp" && otp && <Otp info={otp} onDone={onSignedIn} onRestart={() => setStep("start")} />}
        {step === "enroll" && enroll && <EnrollStep e={enroll} onDone={(c) => { setCodes(c); setStep("codes"); }} />}
        {step === "codes" && <RecoveryCodes codes={codes} onDone={onSignedIn} />}
      </div>
    </div>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return { busy, err, setErr, run: async <T,>(fn: () => Promise<T>) => { setBusy(true); setErr(null); try { return await fn(); } finally { setBusy(false); } } };
}

function SignIn({ onOtp, onMaster }: { onOtp: (o: OtpInfo) => void; onMaster: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const s = useSubmit();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await s.run(() => call<OtpInfo>("/api/admin/auth", "POST", { op: "login", email, password: pw }));
    if (r.ok) onOtp({ challenge: r.challenge, method: r.method, sent_to: r.sent_to, dev_code: r.dev_code });
    else { s.setErr(r.message); setPw(""); }
  };
  return (
    <form className="adm-form" onSubmit={submit}>
      <h1>Studio admin</h1>
      <p className="muted">Sign in with your email and password, then a one-time code.</p>
      <label className="bk-field"><span>Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required maxLength={120} /></label>
      <label className="bk-field"><span>Password</span>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required maxLength={128} /></label>
      {s.err && <p className="adm-err" role="alert">{s.err}</p>}
      <button type="submit" className="bk-btn" disabled={s.busy || !email || !pw}>{s.busy ? "Checking…" : "Continue"}</button>
      <button type="button" className="adm-keybtn" onClick={onMaster} aria-label="More options">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M21 12v2" /></svg>
      </button>
    </form>
  );
}

function Otp({ info, onDone, onRestart }: { info: OtpInfo; onDone: () => void; onRestart: () => void }) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [devCode, setDevCode] = useState(info.dev_code);
  const [note, setNote] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(info.method === "email" ? 60 : 0);
  const s = useSubmit();
  const ref = useRef<HTMLInputElement>(null);
  const email = info.method === "email";

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const r = await s.run(() => call<{ recovery_left: number }>("/api/admin/auth", "POST", { op: "otp", challenge: info.challenge, code }));
    if (r.ok) { onDone(); return; }
    s.setErr(r.message);
    setCode("");
    if ((r as { restart?: boolean }).restart || r.error === "expired") setTimeout(onRestart, 1800);
    ref.current?.focus();
  };
  const resend = async () => {
    setNote(null); s.setErr(null);
    const r = await call<{ sent_to: string; dev_code?: string }>("/api/admin/auth", "POST", { op: "resend", challenge: info.challenge });
    if (r.ok) { setNote(`New code sent to ${r.sent_to}.`); setDevCode(r.dev_code); setCooldown(60); }
    else s.setErr(r.message);
  };
  // auto-submit once 6 digits are in
  useEffect(() => { if (!recovery && /^\d{6}$/.test(code) && !s.busy) submit(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form className="adm-form" onSubmit={submit}>
      <h1>{recovery ? "Use a recovery code" : email ? "Check your email" : "Enter your code"}</h1>
      <p className="muted">{recovery ? "One of the codes you saved when you set up. Each works once."
        : email ? <>We sent a 6-digit code to <strong>{info.sent_to}</strong>. It expires in 10 minutes. Check spam if you don&apos;t see it.</>
        : "Open your authenticator app and type the 6-digit code for Qoui Admin."}</p>
      {devCode && !recovery && <p className="adm-note">Local test mode (no email set up): your code is <strong>{devCode}</strong></p>}
      <input ref={ref} className={recovery ? "adm-code adm-code--rec" : "adm-code"} value={code} autoFocus aria-label={recovery ? "Recovery code" : "6-digit code"}
        inputMode={recovery ? "text" : "numeric"} autoComplete="one-time-code" maxLength={recovery ? 11 : 6}
        placeholder={recovery ? "xxxxx-xxxxx" : "000000"}
        onChange={(e) => setCode(recovery ? e.target.value.toLowerCase() : e.target.value.replace(/\D/g, ""))} />
      {s.err && <p className="adm-err" role="alert">{s.err}</p>}
      {note && <p className="adm-ok" role="status">{note}</p>}
      <button type="submit" className="bk-btn" disabled={s.busy || (recovery ? code.length < 10 : code.length !== 6)}>{s.busy ? "Checking…" : "Sign in"}</button>
      {email && !recovery && (
        <button type="button" className="adm-link" disabled={cooldown > 0} onClick={resend}>
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
        </button>
      )}
      <button type="button" className="adm-link" onClick={() => { setRecovery(!recovery); setCode(""); s.setErr(null); }}>
        {recovery ? (email ? "Use the emailed code instead" : "Use the authenticator app instead") : (email ? "Can't get into your email? Use a recovery code" : "Lost your phone? Use a recovery code")}
      </button>
    </form>
  );
}

function PasswordFields({ pw, setPw, pw2, setPw2 }: { pw: string; setPw: (v: string) => void; pw2: string; setPw2: (v: string) => void }) {
  const strength = pw.length >= 16 ? 3 : pw.length >= 12 ? 2 : pw.length >= 8 ? 1 : 0;
  return (
    <>
      <label className="bk-field"><span>New password</span>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      <div className={`adm-meter adm-meter--${strength}`} aria-hidden="true"><i /><i /><i /></div>
      <p className="bk-hint">At least 12 characters. A short sentence you&apos;ll remember is great, e.g. &ldquo;blush before brunch on fridays&rdquo;.</p>
      <label className="bk-field"><span>Type it again</span>
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" maxLength={128} required /></label>
      {pw2 && pw !== pw2 && <p className="adm-err">The two passwords don&apos;t match.</p>}
    </>
  );
}

// Master key (ADMIN_MASTER_KEY): first owner account, another owner, or recovering a locked-out account.
function Bootstrap({ onEnroll, recover = false, onBack }: { onEnroll: (e: Enroll) => void; recover?: boolean; onBack?: () => void }) {
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const s = useSubmit();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await s.run(() => call<Enroll>("/api/admin/auth", "POST", { op: "master", token, name, email, password: pw }));
    if (r.ok) onEnroll(r); else s.setErr(r.message);
  };
  return (
    <form className="adm-form" onSubmit={submit}>
      <h1>{recover ? "Access key" : "Create the owner account"}</h1>
      <p className="muted">{recover
        ? "Enter the key, then set a new password and sign-in codes."
        : "First-time setup. Enter the access key from the server settings."}</p>
      <label className="bk-field"><span>Key</span><input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" required /></label>
      <label className="bk-field"><span>Your name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
      <label className="bk-field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" maxLength={120} required /></label>
      <PasswordFields pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
      {s.err && <p className="adm-err" role="alert">{s.err}</p>}
      <button type="submit" className="bk-btn" disabled={s.busy || pw.length < 12 || pw !== pw2}>Continue</button>
      {onBack && <button type="button" className="adm-link" onClick={onBack}>Back to sign in</button>}
    </form>
  );
}

function Invite({ token, onEnroll }: { token: string; onEnroll: (e: Enroll) => void }) {
  const [who, setWho] = useState<{ name: string; email: string } | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const s = useSubmit();
  useEffect(() => {
    call<{ name: string; email: string }>("/api/admin/auth", "POST", { op: "invite_info", token }).then((r) => {
      if (r.ok) setWho(r); else s.setErr(r.message);
    });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await s.run(() => call<Enroll>("/api/admin/auth", "POST", { op: "invite_accept", token, password: pw }));
    if (r.ok) onEnroll(r); else s.setErr(r.message);
  };
  if (!who) return <div className="adm-form">{s.err ? <p className="adm-err" role="alert">{s.err}</p> : <span className="bk-spin bk-spin--dark" />}</div>;
  return (
    <form className="adm-form" onSubmit={submit}>
      <h1>Welcome, {who.name.split(" ")[0]}</h1>
      <p className="muted">You&apos;ve been given access to the Qoui admin as <strong>{who.email}</strong>. Set your password, then connect an authenticator app.</p>
      <input type="email" value={who.email} autoComplete="username" readOnly hidden />
      <PasswordFields pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
      {s.err && <p className="adm-err" role="alert">{s.err}</p>}
      <button type="submit" className="bk-btn" disabled={s.busy || pw.length < 12 || pw !== pw2}>Continue</button>
    </form>
  );
}

function EnrollStep({ e, onDone }: { e: Enroll; onDone: (codes: string[]) => void }) {
  const [method, setMethod] = useState<"app" | "email" | null>(null);
  const [app, setApp] = useState<{ otpauth: string; secret: string } | null>(null);
  const [mail, setMail] = useState<{ sent_to: string; dev_code?: string } | null>(null);
  const s = useSubmit();

  const choose = async (m: "app" | "email") => {
    const r = await s.run(() => call<{ otpauth?: string; secret?: string; sent_to?: string; dev_code?: string }>(
      "/api/admin/auth", "POST", { op: "enroll_method", enroll: e.enroll, method: m }));
    if (!r.ok) { s.setErr(r.message); return; }
    setMethod(m);
    if (m === "app") setApp({ otpauth: r.otpauth!, secret: r.secret! });
    else setMail({ sent_to: r.sent_to!, dev_code: r.dev_code });
  };

  if (!method) {
    return (
      <div className="adm-form">
        <h1>How do you want your codes?</h1>
        <p className="muted">Every sign-in asks for your password and a one-time code. Pick where the code comes from.</p>
        <button type="button" className="adm-choice" disabled={s.busy || !e.email_available} onClick={() => choose("email")}>
          <strong>Email me a code</strong>
          <span>{e.email_available ? <>Easiest. We email a code to {e.email} each time you sign in.</> : "Not available yet: email sending isn't set up on the server."}</span>
        </button>
        <button type="button" className="adm-choice" disabled={s.busy} onClick={() => choose("app")}>
          <strong>Authenticator app</strong>
          <span>Most secure. Google or Microsoft Authenticator on your phone, works offline.</span>
        </button>
        {s.err && <p className="adm-err" role="alert">{s.err}</p>}
        <p className="bk-hint">Using email? Turn on 2-step verification for your email account too.</p>
      </div>
    );
  }
  return method === "app" && app
    ? <AppSetup e={e} app={app} onDone={onDone} onBack={() => setMethod(null)} />
    : <EmailSetup e={e} mail={mail!} onDone={onDone} onBack={() => setMethod(null)} />;
}

function ConfirmCode({ enroll, label, onDone }: { enroll: string; label: string; onDone: (codes: string[]) => void }) {
  const [code, setCode] = useState("");
  const s = useSubmit();
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const r = await s.run(() => call<{ recovery_codes: string[] }>("/api/admin/auth", "POST", { op: "enroll_confirm", enroll, code }));
    if (r.ok) onDone(r.recovery_codes); else { s.setErr(r.message); setCode(""); }
  };
  return (
    <form className="adm-form" onSubmit={submit}>
      <input className="adm-code" value={code} onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ""))} inputMode="numeric"
        autoComplete="one-time-code" maxLength={6} placeholder="000000" aria-label={label} autoFocus />
      {s.err && <p className="adm-err" role="alert">{s.err}</p>}
      <button type="submit" className="bk-btn" disabled={s.busy || code.length !== 6}>{s.busy ? "Checking…" : "Finish setup"}</button>
    </form>
  );
}

function EmailSetup({ e, mail, onDone, onBack }: { e: Enroll; mail: { sent_to: string; dev_code?: string }; onDone: (c: string[]) => void; onBack: () => void }) {
  const [info, setInfo] = useState(mail);
  const [note, setNote] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  const resend = async () => {
    const r = await call<{ sent_to: string; dev_code?: string }>("/api/admin/auth", "POST", { op: "resend", enroll: e.enroll });
    if (r.ok) { setInfo(r); setNote("New code sent."); setCooldown(60); } else setNote(r.message);
  };
  return (
    <div className="adm-form">
      <h1>Check your email</h1>
      <p className="muted">We sent a 6-digit code to <strong>{info.sent_to}</strong>. Type it below to finish. Check spam if it&apos;s not there.</p>
      {info.dev_code && <p className="adm-note">Local test mode (no email set up): your code is <strong>{info.dev_code}</strong></p>}
      <ConfirmCode enroll={e.enroll} label="6-digit code from your email" onDone={onDone} />
      {note && <p className="adm-ok" role="status">{note}</p>}
      <button type="button" className="adm-link" disabled={cooldown > 0} onClick={resend}>{cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}</button>
      <button type="button" className="adm-link" onClick={onBack}>Use an authenticator app instead</button>
    </div>
  );
}

function AppSetup({ e, app, onDone, onBack }: { e: Enroll; app: { otpauth: string; secret: string }; onDone: (c: string[]) => void; onBack: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => { QRCode.toDataURL(app.otpauth, { margin: 1, width: 220, color: { dark: "#2b1e1a", light: "#fffdfa" } }).then(setQr); }, [app.otpauth]);
  return (
    <div className="adm-form">
      <h1>Connect your authenticator</h1>
      <ol className="adm-steps">
        <li>Install <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> or <strong>Authy</strong> on your phone.</li>
        <li>In the app tap <strong>+</strong> → <strong>Scan a QR code</strong>, and scan this:</li>
      </ol>
      <div className="adm-qr">{qr ? <img src={qr} alt="QR code for your authenticator app" width={220} height={220} /> : <span className="bk-spin bk-spin--dark" />}</div>
      <button type="button" className="adm-link" onClick={() => setShow(!show)}>{show ? "Hide" : "Can't scan? Enter this key instead"}</button>
      {show && <code className="adm-secret">{app.secret.match(/.{1,4}/g)?.join(" ")}</code>}
      <ol className="adm-steps" start={3}><li>Type the 6-digit code the app shows for <strong>Qoui Admin</strong>:</li></ol>
      <ConfirmCode enroll={e.enroll} label="6-digit code" onDone={onDone} />
      {e.email_available && <button type="button" className="adm-link" onClick={onBack}>Use email codes instead</button>}
    </div>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = `Qoui Admin recovery codes (each works once)\n\n${codes.join("\n")}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "qoui-admin-recovery-codes.txt" });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="adm-form">
      <h1>Save your recovery codes</h1>
      <p className="muted">If you lose your phone, each of these lets you sign in once. Keep them somewhere safe (not on the same phone). You won&apos;t see them again.</p>
      <ul className="adm-codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
      <div className="adm-actions">
        <button type="button" className="bk-btn bk-btn--small bk-btn--ghost" onClick={download}>Download</button>
        <button type="button" className="bk-btn bk-btn--small bk-btn--ghost" onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
      </div>
      <label className="bk-check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span className="bk-check__box" aria-hidden="true" /><span>I&apos;ve saved these codes</span>
      </label>
      <button type="button" className="bk-btn" disabled={!saved} onClick={onDone}>Go to admin</button>
    </div>
  );
}

export { PasswordFields };
