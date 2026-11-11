import Link from "next/link";

export function Arrow() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type BtnProps = {
  href: string;
  label: string;
  variant?: "primary" | "ghost" | "light";
  small?: boolean;
  className?: string;
  magnetic?: boolean;
  ariaLabel?: string;
};

// Pill button: label rolls up on hover, arrow bubble rotates, colour fill grows from the bubble.
export function Btn({ href, label, variant = "primary", small, className = "", magnetic = true, ariaLabel }: BtnProps) {
  const cls = `btn${variant !== "primary" ? ` btn--${variant}` : ""}${small ? " btn--small" : ""} ${className}`.trim();
  const inner = (
    <>
      <span className="btn__label" aria-hidden="true">
        <span>{label}</span>
        <span>{label}</span>
      </span>
      <span className="btn__icon"><Arrow /></span>
    </>
  );
  const common = { className: cls, "aria-label": ariaLabel ?? label, "data-magnetic": magnetic ? "0.25" : undefined };
  if (href.startsWith("/") && !href.startsWith("/api/")) return <Link href={href} {...common}>{inner}</Link>;
  return <a href={href} target="_blank" rel="noopener noreferrer" {...common}>{inner}</a>;
}

export function Star() {
  return (
    <svg className="marquee__star" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0Z" />
    </svg>
  );
}

export function Marquee({ items }: { items: React.ReactNode[] }) {
  const row = items.map((it, i) => (
    <span className="marquee__item" key={i}>{it}<Star /></span>
  ));
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee__track">{row}{row}</div>
    </div>
  );
}

export function SpinBadge({ id, text, className = "" }: { id: string; text: string; className?: string }) {
  return (
    <div className={`spin-badge ${className}`} aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <defs>
          <path id={id} d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0" />
        </defs>
        <text><textPath href={`#${id}`} textLength="228" lengthAdjust="spacing">{text}</textPath></text>
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brush.svg" alt="" />
    </div>
  );
}
