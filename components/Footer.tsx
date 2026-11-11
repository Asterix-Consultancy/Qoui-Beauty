"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Arrow } from "./ui";
import Logo from "./Logo";
import { WaNumber } from "./Live";
import { bookHref, studio, waBook } from "@/lib/site";
import { hoursLines, useSiteData, type SiteData } from "@/lib/useSiteData";

// An eyeshadow palette: tap a pan and the footer "wears" that shade.
const PANS = [
  { name: "Donholm Dusk", c: "#c96f5c" },
  { name: "Nude Silk", c: "#d9a88f" },
  { name: "Gold Hour", c: "#d4a24c" },
  { name: "Berry Night", c: "#b0587a" },
  { name: "Rose Clay", c: "#e08b7b" },
  { name: "Ivory Glow", c: "#f1e4d3" },
];

function nairobiNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, time: `${get("hour")}:${get("minute")}` };
}

function studioStatus(openingHours: SiteData["hours"]) {
  const { day, time } = nairobiNow();
  const today = openingHours[String(day)];
  if (today && time >= today[0] && time < today[1]) return { open: true, text: `Open now · until ${today[1]}`, time };
  for (let i = 0; i < 7; i++) {
    const d = (day + i) % 7;
    const h = openingHours[String(d)];
    if (!h) continue;
    if (i === 0 && time < h[0]) return { open: false, text: `Closed · opens ${h[0]}`, time };
    if (i > 0) return { open: false, text: `Closed · opens ${i === 1 ? "tomorrow" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]} ${h[0]}`, time };
  }
  return { open: false, text: "By appointment", time };
}

export default function Footer() {
  const [pan, setPan] = useState(0);
  const [status, setStatus] = useState<ReturnType<typeof studioStatus> | null>(null);
  const live = useSiteData();

  useEffect(() => {
    const tick = () => setStatus(studioStatus(live.hours));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [live.hours]);

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <footer className="footer" style={{ ["--ink" as string]: PANS[pan].c }}>
      <div className="wrap">
        <div className="footer__cta">
          <h2>Ready for your <em>face beat?</em></h2>
          <Link className="book-orb" href={bookHref()} data-magnetic="0.3" aria-label="Book an appointment">
            <svg className="ring" viewBox="0 0 100 100" aria-hidden="true">
              <defs><path id="orb-ring" d="M50,50 m-40,0 a40,40 0 1,1 80,0 a40,40 0 1,1 -80,0" /></defs>
              <text><textPath href="#orb-ring" textLength="247" lengthAdjust="spacing">Book your face beat · Book now · </textPath></text>
            </svg>
            <span className="book-orb__core">Book</span>
          </Link>
        </div>

        <div className="palette">
          <span className="caption" style={{ color: "rgba(247,243,238,0.55)" }}>Pick a shade, paint the studio</span>
          <div className="palette__pans" role="group" aria-label="Footer colour">
            {PANS.map((p, i) => (
              <button key={p.name} type="button" className="pan" style={{ ["--c" as string]: p.c }}
                aria-pressed={pan === i} aria-label={p.name} onClick={() => setPan(i)}>
                <span className="pan__dent" />
              </button>
            ))}
          </div>
          <span className="palette__name" aria-live="polite">{PANS[pan].name}</span>
        </div>

        <div className="wordmark-giant" aria-label="Qoui">
          {"Qoui".split("").map((ch, i) => <span key={i} aria-hidden="true">{ch}</span>)}
        </div>

        <div className="footer__logo"><Logo size="lg" light /></div>

        <div className="footer__grid">
          <div>
            <span className="caption">Visit</span>
            {status && (
              <span className={`status${status.open ? "" : " is-closed"}`}>
                <i aria-hidden="true" />{status.text} <span style={{ opacity: 0.6 }}>· Nairobi {status.time}</span>
              </span>
            )}
            <ul>
              <li>{studio.area}</li>
              {hoursLines(live.hours).map((h) => <li key={h}>{h}</li>)}
            </ul>
          </div>
          <div>
            <span className="caption">Talk to us</span>
            <ul>
              <li><a href={waBook()} target="_blank" rel="noopener noreferrer">WhatsApp <WaNumber /></a></li>
              <li><a href={`mailto:${studio.email}`}>{studio.email}</a></li>
              <li><a href={studio.instagramUrl} target="_blank" rel="noopener noreferrer">Instagram {studio.instagram}</a></li>
            </ul>
          </div>
          <div>
            <span className="caption">Explore</span>
            <ul>
              <li><Link href="/">Home</Link></li>
              <li><Link href="/book">Book</Link></li>
              <li><Link href="/gallery">Gallery</Link></li>
              <li><Link href="/contact">Contact</Link></li>
              <li><Link href="/privacy">Privacy</Link></li>
            </ul>
          </div>
          <div>
            <span className="caption">Your data</span>
            <p style={{ color: "rgba(247,243,238,0.85)" }}>
              We only use your details to manage your bookings. <Link href="/privacy">Read more</Link>
            </p>
          </div>
        </div>

        <div className="footer__base">
          <span>© {new Date().getFullYear()} {studio.name} · Est. {studio.established} · {studio.area}</span>
          <a className="made-by" href="https://asterisk.co.ke" target="_blank" rel="noopener">
            Made by <b>asterisk.co.ke</b>
          </a>
          <button type="button" className="to-top" onClick={toTop} aria-label="Back to top">
            <span style={{ transform: "rotate(-90deg)", display: "grid", width: 16 }}><Arrow /></span>
          </button>
        </div>
      </div>
    </footer>
  );
}
