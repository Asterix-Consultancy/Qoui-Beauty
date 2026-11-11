import type { Metadata } from "next";
import { WaNumber } from "@/components/Live";
import { studio } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Qoui Glam Studio handles your personal data under Kenya's Data Protection Act, 2019.",
};

export default function PrivacyPage() {
  return (
    <div className="wrap">
      <header className="page-head">
        <span className="eyebrow">Privacy</span>
        <h1>Your details, <em>kept simple.</em></h1>
      </header>
      <div className="prose">
        <p className="lead">
          {studio.name} is a makeup studio in {studio.area} run by {studio.owner}. We collect only what we need to book and
          look after your appointments, in line with Kenya&apos;s Data Protection Act, 2019 and the Data Protection
          (General) Regulations, 2021.
        </p>

        <h2>What we keep</h2>
        <ul>
          <li>Your name and phone number.</li>
          <li>Your bookings: the look, date, time, studio or house-call address, any notes you add, and your M-Pesa confirmation code.</li>
          <li>Messages you send us on WhatsApp, so we can follow the conversation.</li>
          <li>Inspiration photos you send are only looked at to suggest a look. We don&apos;t save them in our booking system.</li>
          <li>To stop spam bookings, a scrambled (one-way) version of your internet address, never the address itself.</li>
        </ul>

        <h2>Why</h2>
        <p>
          Only to manage your bookings: to show free times, hold and confirm your slot, check your deposit, and reply to your
          questions. We don&apos;t sell your data, share it for marketing, or use it for advertising.
        </p>

        <h2>Who helps us</h2>
        <p>
          Our website and booking records are hosted by trusted cloud providers (Vercel and a managed PostgreSQL database),
          and WhatsApp (Meta) carries any messages you send us. They process data on our behalf and only for this purpose.
          Some of them store data outside Kenya, with safeguards as the Act requires.
        </p>

        <h2>How long we keep it</h2>
        <ul>
          <li><strong>Booking and payment records</strong> (including M-Pesa codes): 5 years after your appointment, because
            Kenya&apos;s Tax Procedures Act requires business records to be kept for five years. Then they are deleted.</li>
          <li><strong>Notes and messages</strong>: deleted 12 months after your last appointment.</li>
          <li><strong>Unfinished bookings</strong> (no deposit sent): cancelled automatically and kept only as a booking record.</li>
        </ul>

        <h2>Your rights</h2>
        <p>
          You can ask to see the data we hold about you, to correct it, or to delete it (except what the law makes us keep).
          Message us on WhatsApp at <WaNumber /> or email <a href={`mailto:${studio.email}`}>{studio.email}</a>.
          We reply to requests to see your data within 7 days, and correct or delete it within 14 days.
        </p>
        <p>
          If you&apos;re unhappy with how we handle your data, you can complain to the Office of the Data Protection
          Commissioner (ODPC) at <a href="https://www.odpc.go.ke" target="_blank" rel="noopener noreferrer">odpc.go.ke</a>.
        </p>

        <p className="muted" style={{ fontSize: "0.875rem" }}>Last updated: 11 November 2026</p>
      </div>
    </div>
  );
}
