"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Calendar from "./Calendar";
import {
  addMonths, createBooking, dayLabel, getMeta, getMonth, getSlots, icsFor, kes, normalisePhone, sendDeposit, ym,
  type Booking, type Day, type Meta, type Slot, type SlotsResp,
} from "./api";
import { services as siteServices, studio, waLink } from "@/lib/site";

type Loc = "studio" | "house_call";
type Step = 0 | 1 | 2 | 3 | 4;
const STEPS = ["Look", "Place", "Date & time", "Your details", "Confirm"];

const photoFor = (code: string) => siteServices.find((s) => s.code === code)?.photo ?? "/photos/terracotta-smoky.jpg";

export default function BookingFlow() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [service, setService] = useState<string | null>(null);
  const [loc, setLoc] = useState<Loc | null>(null);
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [month, setMonth] = useState<string>("");
  const [months, setMonths] = useState<Record<string, Day[]>>({});
  const [monthLoading, setMonthLoading] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotsResp | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [time, setTime] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState(""); // honeypot
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [banner, setBanner] = useState<{ tone: "warn" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const top = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------- load + URL prefill
  const loadMeta = useCallback(async () => {
    setMetaError(null);
    const r = await getMeta();
    if (!r.ok) { setMetaError(r.message); return; }
    setMeta(r);
    setMonth((m) => m || ym(r.today));
  }, []);

  useEffect(() => {
    loadMeta();
    const q = new URLSearchParams(window.location.search);
    const s = q.get("service");
    const l = q.get("location");
    if (s) setService(s);
    if (l === "house_call" || l === "studio") setLoc(l);
    if (s && (l === "house_call" || l === "studio")) setStep(2);
    else if (s) setStep(1);
  }, [loadMeta]);

  const svc = meta?.services.find((x) => x.code === service) ?? null;
  const fee = loc === "house_call" ? meta?.house_call_fee_kes ?? 0 : 0;
  const total = svc ? svc.price_kes + fee : null;
  const monthKey = service && loc && month ? `${service}|${loc}|${month}` : null;
  const days = monthKey ? months[monthKey] ?? null : null;

  // ---------------------------------------------------------------- availability
  const fetchMonth = useCallback(async (s: string, l: Loc, m: string, force = false) => {
    const key = `${s}|${l}|${m}`;
    if (!force && months[key]) return;
    setMonthLoading(true);
    const r = await getMonth(s, l, m);
    setMonthLoading(false);
    if (r.ok) setMonths((prev) => ({ ...prev, [key]: r.days }));
    else setBanner({ tone: "error", text: r.message });
  }, [months]);

  useEffect(() => {
    if (step === 2 && service && loc && month) fetchMonth(service, loc, month);
  }, [step, service, loc, month, fetchMonth]);

  const fetchSlots = useCallback(async (s: string, l: Loc, d: string) => {
    setSlotsLoading(true);
    const r = await getSlots(s, l, d);
    setSlotsLoading(false);
    if (!r.ok) { setBanner({ tone: "error", text: r.message }); return null; }
    setSlots(r);
    return r;
  }, []);

  // Re-check the chosen time whenever the look, place or day changes.
  useEffect(() => {
    if (!service || !loc || !date) { setSlots(null); return; }
    let cancelled = false;
    (async () => {
      const r = await fetchSlots(service, loc, date);
      if (cancelled || !r) return;
      setTime((t) => {
        if (!t) return t;
        const still = r.slots.find((x) => x.start_time === t.start_time && x.available);
        if (!still) setBanner({ tone: "warn", text: `${t.label} isn't free for this choice any more. Please pick another time.` });
        return still ?? null;
      });
    })();
    return () => { cancelled = true; };
  }, [service, loc, date, fetchSlots]);

  const nextFree = useMemo(() => {
    if (!days || !date) return null;
    return days.find((d) => d.date > date && (d.status === "available" || d.status === "limited"))?.date ?? null;
  }, [days, date]);

  // ---------------------------------------------------------------- validation
  const phoneOk = normalisePhone(phone) !== null;
  const addressOk = loc !== "house_call" || (area.trim().length >= 2 && address.trim().length >= 3);
  const errors = {
    name: name.trim().length < 2 ? "Please enter your name." : "",
    phone: !phoneOk ? "Enter a valid number, e.g. 0712 345 678." : "",
    consent: !consent ? "Please tick to continue." : "",
  };
  const canNext: Record<Step, boolean> = {
    0: !!svc,
    1: !!loc && addressOk,
    2: !!date && !!time,
    3: !errors.name && !errors.phone && !errors.consent,
    4: true,
  };

  const goto = (s: Step) => {
    setBanner(null);
    setStep(s);
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const next = () => {
    if (step === 3) setTouched({ name: true, phone: true, consent: true });
    if (!canNext[step]) return;
    if (step < 4) goto((step + 1) as Step);
  };

  // ---------------------------------------------------------------- submit
  const submit = async () => {
    if (!svc || !loc || !time || submitting) return;
    setSubmitting(true);
    setBanner(null);
    const r = await createBooking({
      service: svc.code, location_type: loc,
      address: loc === "house_call" ? `${area.trim()} · ${address.trim()}` : null,
      start_time: time.start_time, name: name.trim(), phone, notes: notes.trim() || null, consent, company,
    });
    setSubmitting(false);
    if (r.ok) { setBooking(r.booking); requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth" })); return; }
    if (r.error === "taken") {
      setTime(null);
      if (service && loc && date) { fetchSlots(service, loc, date); fetchMonth(service, loc, month, true); }
      goto(2);
      setBanner({ tone: "warn", text: r.message });
      return;
    }
    const stepFor: Record<string, Step> = { name: 3, phone: 3, consent: 3, address: 1, location: 1, service: 0, time: 2 };
    if (stepFor[r.error] !== undefined) goto(stepFor[r.error]);
    setBanner({ tone: "error", text: r.message });
  };

  // ---------------------------------------------------------------- render
  if (metaError) {
    return (
      <div className="bk bk--center">
        <div className="bk-error">
          <h2>We can&apos;t load bookings right now.</h2>
          <p className="muted">{metaError}</p>
          <div className="cta-row" style={{ marginTop: 0 }}>
            <button type="button" className="bk-btn" onClick={loadMeta}>Try again</button>
            <a className="bk-btn bk-btn--ghost" href={waLink("Hi Qoui, I'd like to book an appointment.")} target="_blank" rel="noopener noreferrer">Book on WhatsApp instead</a>
          </div>
        </div>
      </div>
    );
  }

  if (booking) return <Done booking={booking} name={name.trim()} />;

  return (
    <div className="bk" ref={top}>
      <ol className="bk-steps" aria-label="Booking steps">
        {STEPS.map((label, i) => {
          const reachable = i <= step || (i === step + 1 && canNext[step]);
          return (
            <li key={label} className={i === step ? "is-current" : i < step ? "is-done" : ""}>
              <button type="button" disabled={!reachable && i > step} onClick={() => (i < step || reachable) && goto(i as Step)}
                aria-current={i === step ? "step" : undefined}>
                <span className="bk-steps__n">{i < step ? "✓" : i + 1}</span>
                <span className="bk-steps__label">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="bk-progress" aria-hidden="true"><span style={{ transform: `scaleX(${(step + 1) / STEPS.length})` }} /></div>

      <div className="bk-body">
        <section className="bk-panel" aria-live="polite">
          {banner && (
            <div className={`bk-banner bk-banner--${banner.tone}`} role="alert">
              <span>{banner.text}</span>
              <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss">✕</button>
            </div>
          )}

          {step === 0 && (
            <div className="bk-step" key="s0">
              <h2 className="bk-title">Which look are we doing?</h2>
              {!meta ? <div className="bk-skel-list"><i /><i /><i /></div> : (
                <div className="bk-looks" role="radiogroup" aria-label="Look">
                  {meta.services.map((s) => (
                    <button key={s.code} type="button" role="radio" aria-checked={service === s.code}
                      className={`bk-look${service === s.code ? " is-on" : ""}`}
                      onClick={() => { setService(s.code); setTime(null); }}>
                      <span className="bk-look__img"><Image src={photoFor(s.code)} alt="" fill sizes="96px" /></span>
                      <span className="bk-look__text">
                        <strong>{s.name}</strong>
                        <span>{s.includes}</span>
                        <span className="bk-look__meta">{Math.round(s.duration_min / 6) / 10} hr · <b>{kes(s.price_kes)}</b></span>
                      </span>
                      <span className="bk-radio" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 1 && meta && (
            <div className="bk-step" key="s1">
              <h2 className="bk-title">Where should Betty do your makeup?</h2>
              <div className="bk-places" role="radiogroup" aria-label="Place">
                <button type="button" role="radio" aria-checked={loc === "studio"} className={`bk-place${loc === "studio" ? " is-on" : ""}`}
                  onClick={() => { setLoc("studio"); setTime(null); }}>
                  <span className="bk-place__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
                  </span>
                  <strong>At the studio</strong>
                  <span>{studio.area}. Directions sent after booking.</span>
                  <em>No extra fee</em>
                </button>
                <button type="button" role="radio" aria-checked={loc === "house_call"} className={`bk-place${loc === "house_call" ? " is-on" : ""}`}
                  onClick={() => { setLoc("house_call"); setTime(null); }}>
                  <span className="bk-place__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zm0-9a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" /></svg>
                  </span>
                  <strong>House call</strong>
                  <span>Betty comes to you, anywhere in Nairobi.</span>
                  <em>+ {kes(meta.house_call_fee_kes)}</em>
                </button>
              </div>
              {loc === "house_call" && (
                <div className="bk-fields bk-reveal">
                  <label className="bk-field">
                    <span>Area / estate</span>
                    <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Umoja 1" autoComplete="address-level2" maxLength={80} />
                  </label>
                  <label className="bk-field">
                    <span>Address & directions</span>
                    <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Building, house no., landmark" autoComplete="street-address" maxLength={200} />
                  </label>
                  <p className="bk-hint">Betty also needs time to travel, so some times may show as taken around other house calls.</p>
                </div>
              )}
            </div>
          )}

          {step === 2 && meta && service && loc && month && (
            <div className="bk-step" key="s2">
              <h2 className="bk-title">Pick your day and time</h2>
              <div className="bk-when">
                <Calendar
                  month={month} days={days} loading={monthLoading} selected={date} today={meta.today}
                  minMonth={ym(meta.min_date)} maxMonth={ym(meta.max_date)}
                  onMonth={(m) => setMonth(m)}
                  onSelect={(d) => { setDate(d); setTime(null); setBanner(null); }}
                />
                <TimePicker
                  date={date} slots={slots} loading={slotsLoading} selected={time}
                  onPick={(s) => { setTime(s); setBanner(null); }}
                  nextFree={nextFree}
                  onNextFree={() => { if (nextFree) { setDate(nextFree); setTime(null); } }}
                  onLaterMonth={() => setMonth(addMonths(month, 1))}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="bk-step" key="s3">
              <h2 className="bk-title">Who are we glamming?</h2>
              <div className="bk-fields">
                <label className={`bk-field${touched.name && errors.name ? " has-error" : ""}`}>
                  <span>Your name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                    autoComplete="name" maxLength={80} placeholder="First and last name" />
                  {touched.name && errors.name && <small>{errors.name}</small>}
                </label>
                <label className={`bk-field${touched.phone && errors.phone ? " has-error" : ""}`}>
                  <span>WhatsApp number</span>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                    autoComplete="tel" inputMode="tel" maxLength={20} placeholder="0712 345 678" />
                  {touched.phone && errors.phone ? <small>{errors.phone}</small> : <em className="bk-hint">Betty confirms your booking here.</em>}
                </label>
                <label className="bk-field">
                  <span>Anything Betty should know? <i>(optional)</i></span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3}
                    placeholder="Skin concerns, lashes, the outfit colour, inspiration…" />
                </label>
                <label className="bk-hp" aria-hidden="true">
                  Company<input tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
                </label>
                <label className={`bk-check${touched.consent && errors.consent ? " has-error" : ""}`}>
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span className="bk-check__box" aria-hidden="true" />
                  <span>Use my details only for this booking. <a href="/privacy" target="_blank">Privacy</a></span>
                </label>
              </div>
            </div>
          )}

          {step === 4 && svc && loc && time && date && (
            <div className="bk-step" key="s4">
              <h2 className="bk-title">Check it&apos;s all right</h2>
              <dl className="bk-review">
                <Row label="Look" value={`${svc.name} · ${kes(svc.price_kes)}`} onEdit={() => goto(0)} />
                <Row label="Place" value={loc === "studio" ? `Studio, ${studio.area}` : `House call · ${area} · ${address}`} onEdit={() => goto(1)} />
                <Row label="When" value={`${dayLabel(date)} at ${time.label}`} onEdit={() => goto(2)} />
                <Row label="You" value={`${name} · ${phone}`} onEdit={() => goto(3)} />
                {notes.trim() && <Row label="Notes" value={notes.trim()} onEdit={() => goto(3)} />}
              </dl>
              <div className="bk-deposit-note">
                <strong>How it works:</strong> we hold your slot for {meta?.hold_hours ?? 12} hours. Send the {kes(meta?.deposit_kes ?? 0)} M-Pesa
                deposit on the next screen and Betty confirms your booking. The rest ({kes((total ?? 0) - (meta?.deposit_kes ?? 0))}) is paid on the day.
              </div>
            </div>
          )}

          <div className="bk-actions">
            {step > 0 ? <button type="button" className="bk-btn bk-btn--ghost" onClick={() => goto((step - 1) as Step)}>Back</button> : <span />}
            {step < 4 ? (
              <button type="button" className="bk-btn" onClick={next} disabled={step !== 3 && !canNext[step]}>Continue</button>
            ) : (
              <button type="button" className={`bk-btn bk-btn--confirm${submitting ? " is-busy" : ""}`} onClick={submit} disabled={submitting}>
                {submitting ? <><span className="bk-spin" aria-hidden="true" />Booking…</> : <>Confirm booking · {kes(total ?? 0)}</>}
              </button>
            )}
          </div>
        </section>

        <Summary svc={svc?.name ?? null} price={svc?.price_kes ?? null} loc={loc} fee={fee} date={date} time={time?.label ?? null}
          total={total} deposit={meta?.deposit_kes ?? null} photo={service ? photoFor(service) : null} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function TimePicker({ date, slots, loading, selected, onPick, nextFree, onNextFree, onLaterMonth }: {
  date: string | null; slots: SlotsResp | null; loading: boolean; selected: Slot | null;
  onPick: (s: Slot) => void; nextFree: string | null; onNextFree: () => void; onLaterMonth: () => void;
}) {
  if (!date) {
    return (
      <div className="times times--empty">
        <p className="times__prompt">Tap a day to see Betty&apos;s times.</p>
        <span className="muted">Days with dots have free times. More dots, more choice.</span>
      </div>
    );
  }
  const list = slots && slots.date === date ? slots.slots : [];
  const groups = [
    { name: "Morning", items: list.filter((s) => s.label < "12:00") },
    { name: "Afternoon", items: list.filter((s) => s.label >= "12:00" && s.label < "16:00") },
    { name: "Evening", items: list.filter((s) => s.label >= "16:00") },
  ].filter((g) => g.items.length);
  const free = list.filter((s) => s.available).length;

  return (
    <div className="times">
      <div className="times__head">
        <h3>{dayLabel(date, { weekday: "long", day: "numeric", month: "short" })}</h3>
        {!loading && slots?.date === date && <span className="muted">{free} free · {list.length - free} unavailable</span>}
      </div>
      {loading || slots?.date !== date ? (
        <div className="times__skel">{Array.from({ length: 9 }).map((_, i) => <i key={i} />)}</div>
      ) : free === 0 ? (
        <div className="times__none">
          <p>{slots?.message ?? "No free times left this day."}</p>
          {nextFree ? (
            <button type="button" className="bk-btn bk-btn--small" onClick={onNextFree}>Next free day: {dayLabel(nextFree, { weekday: "short", day: "numeric", month: "short" })}</button>
          ) : (
            <button type="button" className="bk-btn bk-btn--small bk-btn--ghost" onClick={onLaterMonth}>Look at next month</button>
          )}
          {list.length > 0 && <TimeGroups groups={groups} selected={selected} onPick={onPick} />}
        </div>
      ) : (
        <TimeGroups groups={groups} selected={selected} onPick={onPick} />
      )}
    </div>
  );
}

function TimeGroups({ groups, selected, onPick }: { groups: { name: string; items: Slot[] }[]; selected: Slot | null; onPick: (s: Slot) => void }) {
  return (
    <div className="times__groups">
      {groups.map((g) => (
        <div key={g.name} className="times__group">
          <span className="caption">{g.name}</span>
          <div className="times__grid" role="radiogroup" aria-label={`${g.name} times`}>
            {g.items.map((s, i) => (
              <button key={s.start_time} type="button" role="radio" aria-checked={selected?.start_time === s.start_time}
                className={`slot${s.available ? "" : " is-off"}${selected?.start_time === s.start_time ? " is-on" : ""}`}
                style={{ animationDelay: `${i * 18}ms` }}
                disabled={!s.available}
                aria-label={`${s.label}${s.available ? "" : s.reason === "too_soon" ? ", too soon to book" : ", already taken"}`}
                onClick={() => onPick(s)}>
                <span>{s.label}</span>
                {!s.available && <small>{s.reason === "too_soon" ? "Too soon" : "Taken"}</small>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Summary({ svc, price, loc, fee, date, time, total, deposit, photo }: {
  svc: string | null; price: number | null; loc: Loc | null; fee: number; date: string | null; time: string | null;
  total: number | null; deposit: number | null; photo: string | null;
}) {
  return (
    <aside className="bk-sum" aria-label="Your booking">
      <div className="bk-sum__img">
        {photo ? <Image key={photo} src={photo} alt="" fill sizes="(min-width: 960px) 320px, 100vw" /> : <span>Your look</span>}
      </div>
      <div className="bk-sum__body">
        <span className="caption">Your booking</span>
        <ul>
          <li className={svc ? "is-set" : ""}><span>Look</span><b>{svc ?? "—"}</b></li>
          <li className={loc ? "is-set" : ""}><span>Place</span><b>{loc ? (loc === "studio" ? "Studio" : "House call") : "—"}</b></li>
          <li className={date ? "is-set" : ""}><span>Day</span><b>{date ? dayLabel(date, { weekday: "short", day: "numeric", month: "short" }) : "—"}</b></li>
          <li className={time ? "is-set" : ""}><span>Time</span><b>{time ?? "—"}</b></li>
        </ul>
        <div className="bk-sum__lines">
          {price !== null && <div><span>{svc}</span><span>{kes(price)}</span></div>}
          {loc === "house_call" && <div><span>House call</span><span>{kes(fee)}</span></div>}
        </div>
        <div className="bk-sum__total">
          <span>Total</span>
          <b key={total ?? 0} className="price-flip">{total !== null ? kes(total) : "—"}</b>
        </div>
        {deposit !== null && total !== null && <p className="bk-sum__dep">{kes(deposit)} deposit holds your slot</p>}
      </div>
    </aside>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="bk-review__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
      <button type="button" onClick={onEdit} aria-label={`Edit ${label.toLowerCase()}`}>Edit</button>
    </div>
  );
}

function Done({ booking, name }: { booking: Booking; name: string }) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const where = booking.location_type === "studio" ? booking.studio_address || `Qoui Glam Studio, ${studio.area}` : booking.address ?? "House call";
  const clean = code.replace(/\s/g, "").toUpperCase();

  const copy = async () => {
    try { await navigator.clipboard.writeText(booking.mpesa_number.replace(/\s/g, "")); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard blocked: number is visible anyway */ }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[A-Z0-9]{10}$/.test(clean)) { setErr("M-Pesa codes are 10 letters and numbers, e.g. TKB4XYZ12A."); return; }
    setErr(null);
    setState("sending");
    const r = await sendDeposit(booking.booking_id, booking.token, clean);
    if (r.ok) setState("sent");
    else { setState("idle"); setErr(r.message); }
  };

  return (
    <div className="bk bk--done">
      <div className="done">
        <svg className="done__tick" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" />
          <path d="M36 62 L54 79 L86 43" />
        </svg>
        <span className="caption">Booking #{booking.booking_id}</span>
        <h2>You&apos;re pencilled in{name ? `, ${name.split(" ")[0]}` : ""}.</h2>
        <p className="lead" style={{ margin: "0 auto" }}>
          {booking.service} · {booking.label} · {booking.location_type === "studio" ? "at the studio" : "house call"}
        </p>

        <div className="done__grid">
          <div className={`done__card done__deposit${state === "sent" ? " is-sent" : ""}`}>
            {state === "sent" ? (
              <>
                <h3>Code received.</h3>
                <p className="muted">Betty will check the payment and confirm your booking. She&apos;ll reach you on the number you gave. You can close this page.</p>
              </>
            ) : (
              <>
                <span className="caption">Step 1 · Send the deposit</span>
                <p className="done__amount">{kes(booking.deposit_kes)}</p>
                <p className="muted">M-Pesa → Send Money to</p>
                <button type="button" className="done__copy" onClick={copy}>
                  <b>{booking.mpesa_number}</b><span>{booking.mpesa_name}</span><i>{copied ? "Copied" : "Copy"}</i>
                </button>
                <form onSubmit={send} className="done__form">
                  <span className="caption">Step 2 · Paste your M-Pesa code</span>
                  <div className={`done__code${err ? " has-error" : ""}`}>
                    <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={14} placeholder="e.g. TKB4XYZ12A"
                      autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="M-Pesa confirmation code" />
                    <span className="done__count">{clean.length}/10</span>
                  </div>
                  {err && <small className="done__err" role="alert">{err}</small>}
                  <button type="submit" className="bk-btn" disabled={state === "sending" || clean.length !== 10}>
                    {state === "sending" ? <><span className="bk-spin" aria-hidden="true" />Sending…</> : "Send code to Betty"}
                  </button>
                </form>
                <p className="bk-hint">Slot held for {booking.hold_hours} hours. The balance of {kes(booking.total_kes - booking.deposit_kes)} is paid on the day.</p>
              </>
            )}
          </div>
          <div className="done__card">
            <span className="caption">Your appointment</span>
            <ul className="done__list">
              <li><span>Look</span><b>{booking.service}</b></li>
              <li><span>When</span><b>{booking.label}</b></li>
              <li><span>Where</span><b>{where}</b></li>
              <li><span>Total</span><b>{kes(booking.total_kes)}</b></li>
            </ul>
            {booking.studio_directions && <p className="bk-hint" style={{ whiteSpace: "pre-line" }}><strong>Directions:</strong> {booking.studio_directions}</p>}
            <div className="done__links">
              <a className="bk-btn bk-btn--ghost bk-btn--small" href={icsFor(booking, where)} download={`qoui-booking-${booking.booking_id}.ics`}>Add to calendar</a>
              <a className="bk-btn bk-btn--ghost bk-btn--small" target="_blank" rel="noopener noreferrer"
                href={waLink(`Hi Qoui, this is about booking #${booking.booking_id} (${booking.service}, ${booking.label}).`)}>Message us on WhatsApp</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
