"use client";

import { Btn } from "./ui";
import { bookHref, kes, waBook } from "@/lib/site";
import { hoursLines, prettyPhone, useSiteData } from "@/lib/useSiteData";

// Small live pieces used inside otherwise static pages.

export function FromPrice() {
  const d = useSiteData();
  const from = Math.min(...d.services.map((s) => s.price_kes));
  return <>Looks from {kes(from)}</>;
}

// The studio's WhatsApp number as text, or a tel: link, always the number set in Admin.
export function WaNumber() {
  return <>{prettyPhone(useSiteData().whatsapp_number)}</>;
}

export function CallLink({ className, children }: { className?: string; children: React.ReactNode }) {
  const d = useSiteData();
  return <a className={className} href={`tel:+${d.whatsapp_number}`}>{children}</a>;
}

export function HoursList({ as = "strong" }: { as?: "strong" | "li" }) {
  const d = useSiteData();
  return (
    <>
      {hoursLines(d.hours).map((h) =>
        as === "li" ? <li key={h}>{h}</li> : <strong key={h} style={{ fontSize: "1.1rem" }}>{h}</strong>,
      )}
    </>
  );
}

// Testimonials Betty manages in Admin → Reviews. The section stays hidden until there's at least one.
export function Testimonials() {
  const d = useSiteData();
  if (!d.testimonials.length) return null;
  return (
    <section className="section section--sand section--round" aria-labelledby="words-title">
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Kind words</span>
          <h2 id="words-title">From the <em>chair.</em></h2>
        </div>
        <div className="quotes">
          {d.testimonials.map((t, i) => (
            <figure key={i} className="quote quote--in" style={{ animationDelay: `${i * 90}ms` }}>
              <p>&ldquo;{t.quote}&rdquo;</p>
              <figcaption className="quote__who">
                <span aria-hidden="true">{t.name.charAt(0)}</span>
                <span>
                  <strong style={{ display: "block", fontWeight: 500 }}>{t.name}</strong>
                  {t.service && <span className="muted" style={{ fontSize: "0.85rem" }}>{t.service}</span>}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="cta-row">
          <Btn href={bookHref()} label="Book an appointment" />
          <Btn href={waBook()} label="Chat on WhatsApp" variant="ghost" />
        </div>
      </div>
    </section>
  );
}
