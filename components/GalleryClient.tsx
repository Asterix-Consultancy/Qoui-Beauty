"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Btn } from "./ui";
import { bookHref, caption, gallery, kes, serviceByCode, services, waLink, type GalleryItem, type ServiceCode } from "@/lib/site";
import { priceOf, useSiteData } from "@/lib/useSiteData";

type Filter = "all" | ServiceCode;
const FILTERS: Filter[] = ["all", ...services.map((s) => s.code)];
const SHAPES = ["g-a", "g-b", "g-c", "g-d", "g-e"]; // editorial rhythm: tall, square, wide...

export default function GalleryClient() {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);
  const items = filter === "all" ? gallery : gallery.filter((g) => g.service === filter);
  const count = (f: Filter) => (f === "all" ? gallery.length : gallery.filter((g) => g.service === f).length);
  const featured = filter === "all" ? serviceByCode("glam") : serviceByCode(filter);
  const live = useSiteData();
  const price = (code: ServiceCode) => priceOf(live, code) ?? serviceByCode(code).priceKes;

  // sliding pill behind the active filter
  const bar = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = bar.current?.querySelector<HTMLElement>(`[data-f="${filter}"]`);
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [filter]);

  // clip-path reveal as tiles scroll in (re-run when the filter changes)
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tiles = grid.current?.querySelectorAll<HTMLElement>(".gtile:not(.is-in)") ?? [];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      tiles.forEach((t) => t.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -6% 0px" });
    tiles.forEach((t) => io.observe(t));
    const failsafe = setTimeout(() => tiles.forEach((t) => t.classList.add("is-in")), 2500);
    return () => { io.disconnect(); clearTimeout(failsafe); };
  }, [filter]);

  return (
    <>
      <div className="gbar">
        <div className="gfilters" ref={bar} role="group" aria-label="Filter by look">
          <span className="gfilters__pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} aria-hidden="true" />
          {FILTERS.map((f) => (
            <button key={f} type="button" data-f={f} className="gfilter" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : serviceByCode(f).name}<sup>{String(count(f)).padStart(2, "0")}</sup>
            </button>
          ))}
        </div>
        <span className="gcount" aria-live="polite"><b key={filter}>{String(items.length).padStart(2, "0")}</b> looks</span>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <p>{featured.name} photos are on their way.</p>
          <span className="muted">Ask on WhatsApp and Betty will send recent {featured.name.toLowerCase()} looks.</span>
          <Btn href={waLink(`Hi Qoui, can I see some recent ${featured.name.toLowerCase()} looks?`)} label="Ask on WhatsApp" small />
        </div>
      ) : (
        <div className="ggrid" ref={grid} key={filter}>
          {items.map((g, i) => {
            const s = serviceByCode(g.service);
            return (
              <figure className={`gtile ${SHAPES[i % SHAPES.length]}`} key={g.id} style={{ ["--d" as string]: `${(i % 3) * 90}ms` }}>
                <button type="button" onClick={() => setOpen(i)} aria-label={`Open ${caption(g)} full screen`} data-cursor="View">
                  <span className="gtile__img">
                    <Image src={g.src} alt={g.alt} fill sizes="(min-width: 900px) 50vw, 100vw" quality={80} />
                  </span>
                  <span className="gtile__num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <span className="gtile__over" aria-hidden="true">
                    <span><b>{s.name}</b><i>{g.occasion}</i></span>
                    <span className="gtile__price">{kes(price(s.code))}</span>
                  </span>
                </button>
                <figcaption className="caption">{caption(g)}</figcaption>
              </figure>
            );
          })}
        </div>
      )}

      <div className="gcta">
        <p>Your face <em>could be next.</em></p>
        <Btn href={bookHref(featured.code)} label={`Book ${featured.name} · ${kes(price(featured.code))}`} />
      </div>

      {open !== null && items[open] && <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

function Lightbox({ items, index, onIndex, onClose }: {
  items: GalleryItem[]; index: number; onIndex: (i: number) => void; onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const startX = useRef<number | null>(null);
  const item = items[index];
  const go = useCallback((d: number) => onIndex((index + d + items.length) % items.length), [index, items.length, onIndex]);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = prevOverflow; prevFocus?.focus(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const s = serviceByCode(item.service);
  const live = useSiteData();
  const p = priceOf(live, s.code) ?? s.priceKes;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={caption(item)}
      onPointerDown={(e) => { startX.current = e.clientX; }}
      onPointerUp={(e) => {
        if (startX.current === null) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}>
      <div className="lightbox__bar">
        <span className="caption">{String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</span>
        <div className="lightbox__progress" aria-hidden="true"><span style={{ transform: `scaleX(${(index + 1) / items.length})` }} /></div>
        <button ref={closeRef} type="button" className="iconbtn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="lightbox__stage">
        <Image key={item.id} src={item.src} alt={item.alt} width={item.w} height={item.h} sizes="100vw" quality={85} />
      </div>
      <div className="lightbox__thumbs" role="group" aria-label="All photos">
        {items.map((g, i) => (
          <button key={g.id} type="button" className={i === index ? "is-on" : ""} onClick={() => onIndex(i)} aria-label={`Show ${caption(g)}`}>
            <Image src={g.src} alt="" width={64} height={80} sizes="64px" />
          </button>
        ))}
      </div>
      <div className="lightbox__foot">
        <button type="button" className="iconbtn" onClick={() => go(-1)} aria-label="Previous photo">‹</button>
        <div style={{ textAlign: "center", display: "grid", gap: "0.75rem", justifyItems: "center" }}>
          <span className="caption">{caption(item)}</span>
          <Btn href={bookHref(s.code)} label={`Book this look · ${kes(p)}`} variant="light" small magnetic={false} />
        </div>
        <button type="button" className="iconbtn" onClick={() => go(1)} aria-label="Next photo">›</button>
      </div>
    </div>
  );
}
