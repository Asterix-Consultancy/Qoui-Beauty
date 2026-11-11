import type { Metadata } from "next";
import BookingFlow from "@/components/booking/BookingFlow";
import { waLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "Book an appointment",
  description: "Book soft glam, glam or bridal makeup with Betty in Donholm, Nairobi, or as a house call. See live availability.",
};

export default function BookPage() {
  return (
    <div className="book-page">
      <div className="book-page__glow" aria-hidden="true" />
      <div className="wrap">
        <header className="book-head">
          <span className="eyebrow">Book an appointment</span>
          <h1>Your chair is <em>waiting.</em></h1>
          <p className="lead">Live availability. Takes about a minute. Prefer to chat?{" "}
            <a href={waLink("Hi Qoui, I'd like to book an appointment.")} target="_blank" rel="noopener noreferrer">Book on WhatsApp</a>.
          </p>
        </header>
        <BookingFlow />
      </div>
    </div>
  );
}
