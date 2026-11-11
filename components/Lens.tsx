"use client";

import { useRef, useState } from "react";

const ZOOM = 2.6;

// "Look closer" magnifier: a round glass follows the pointer (or finger) and shows
// the blend up close. Uses the full-size photo as the glass background.
export default function Lens({ src, alt }: { src: string; alt: string }) {
  const box = useRef<HTMLDivElement>(null);
  const glass = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  const move = (e: React.PointerEvent) => {
    const el = box.current, g = glass.current;
    if (!el || !g) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
    const y = Math.max(0, Math.min(r.height, e.clientY - r.top));
    g.style.left = `${x}px`;
    g.style.top = `${y}px`;
    g.style.backgroundSize = `${r.width * ZOOM}px ${r.height * ZOOM}px`;
    g.style.backgroundPosition = `${-(x * ZOOM - 90)}px ${-(y * ZOOM - 90)}px`;
  };

  return (
    <div
      ref={box}
      className={`lens${active ? " is-active" : ""}`}
      onPointerEnter={(e) => { setActive(true); move(e); }}
      onPointerDown={(e) => { setActive(true); move(e); }}
      onPointerMove={move}
      onPointerLeave={() => setActive(false)}
      onPointerUp={(e) => { if (e.pointerType !== "mouse") setActive(false); }}
      onPointerCancel={() => setActive(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" draggable={false} />
      <div ref={glass} className="lens__glass" style={{ backgroundImage: `url(${src})` }} aria-hidden="true" />
      <span className="lens__hint" aria-hidden="true">Hover or touch to look closer</span>
    </div>
  );
}
