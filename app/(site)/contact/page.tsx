import type { Metadata } from "next";
import { Btn } from "@/components/ui";
import { CallLink, HoursList, WaNumber } from "@/components/Live";
import { studio, waBook } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Find Qoui Glam Studio in Donholm, Nairobi. WhatsApp, phone, email and hours.",
};

export default function ContactPage() {
  return (
    <div className="wrap">
      <header className="page-head">
        <span className="eyebrow">Contact</span>
        <h1>Come say <em>hi.</em></h1>
      </header>
      <div className="contact">
        <div className="contact__cards">
          <a className="ccard" href={waBook()} target="_blank" rel="noopener noreferrer">
            <span><span className="caption">WhatsApp · fastest</span><strong><WaNumber /></strong></span><i aria-hidden="true">→</i>
          </a>
          <CallLink className="ccard">
            <span><span className="caption">Call</span><strong><WaNumber /></strong></span><i aria-hidden="true">→</i>
          </CallLink>
          <a className="ccard" href={`mailto:${studio.email}`}>
            <span><span className="caption">Email</span><strong>{studio.email}</strong></span><i aria-hidden="true">→</i>
          </a>
          <div className="ccard">
            <span><span className="caption">Studio</span><strong>{studio.area}</strong><span className="muted" style={{ fontSize: "0.9rem" }}>Exact directions sent when you book.</span></span>
          </div>
          <div className="ccard">
            <span><span className="caption">Hours</span><HoursList /></span>
          </div>
          <a className="ccard" href={studio.instagramUrl} target="_blank" rel="noopener noreferrer">
            <span><span className="caption">Instagram</span><strong>{studio.instagram}</strong></span><i aria-hidden="true">→</i>
          </a>
          <div style={{ marginTop: "0.5rem" }}><Btn href="/book" label="Book an appointment" /></div>
        </div>
        <iframe className="map" title="Map of Donholm, Nairobi"
          src="https://www.google.com/maps?q=Donholm,+Nairobi,+Kenya&z=14&output=embed"
          loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      </div>
    </div>
  );
}
