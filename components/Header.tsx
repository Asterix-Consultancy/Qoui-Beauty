"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Btn } from "./ui";
import Logo from "./Logo";
import { WaNumber } from "./Live";
import { bookHref, studio } from "@/lib/site";

const links = [
  { href: "/", label: "Home" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 20);
      setHidden(y > 240 && y > lastY.current + 4);
      if (y < lastY.current - 4 || y < 240) setHidden(false);
      lastY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <>
      <header className={`header${scrolled ? " is-scrolled" : ""}${hidden && !open ? " is-hidden" : ""}`}>
        <div className="wrap">
          <div className="header__bar">
            <Link href="/" className="logo" aria-label={`${studio.name}, home`}>
              <Logo size="md" />
            </Link>
            <nav className="nav" aria-label="Main">
              {links.map((l) => (
                <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>{l.label}</Link>
              ))}
              <span style={{ width: 8 }} />
              <Btn href={bookHref()} label="Book now" small />
            </nav>
            <button
              type="button"
              className="menu-btn"
              aria-expanded={open}
              aria-controls="site-menu"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? "Close" : "Menu"}
              <i aria-hidden="true"><b /><b /></i>
            </button>
          </div>
        </div>
      </header>

      <div id="site-menu" className={`menu${open ? " is-open" : ""}`} aria-hidden={!open}>
        <nav aria-label="Mobile">
          {links.map((l) => (
            <Link key={l.href} href={l.href} tabIndex={open ? 0 : -1}>{l.label}</Link>
          ))}
          <Link href={bookHref()} tabIndex={open ? 0 : -1}><em>Book now</em></Link>
        </nav>
        <div className="menu__foot">
          <span>{studio.area}</span>
          <a href={`mailto:${studio.email}`} tabIndex={open ? 0 : -1}>{studio.email}</a>
          <span>WhatsApp <WaNumber /></span>
        </div>
      </div>
    </>
  );
}

export function BookBar() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const footer = document.querySelector(".footer");
    if (!footer || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setHidden(e.isIntersecting), { threshold: 0.05 });
    io.observe(footer);
    return () => io.disconnect();
  }, []);
  if (pathname === "/book") return null;
  return (
    <div className={`bookbar${hidden ? " is-hidden" : ""}`}>
      <Btn href={bookHref()} label="Book an appointment" magnetic={false} />
    </div>
  );
}
