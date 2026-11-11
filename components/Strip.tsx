"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { caption, gallery } from "@/lib/site";

// Horizontal, drag-to-scroll gallery (mouse drag on desktop, native swipe on phones).
export default function Strip() {
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const p = max > 0 ? el.scrollLeft / max : 1;
      if (bar.current) bar.current.style.transform = `scaleX(${0.1 + p * 0.9})`;
    };
    let down = false, moved = false, startX = 0, startLeft = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      down = true; moved = false; startX = e.clientX; startLeft = el.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) { moved = true; el.classList.add("is-dragging"); }
      el.scrollLeft = startLeft - dx;
    };
    const onUp = () => {
      down = false;
      setTimeout(() => el.classList.remove("is-dragging"), 0);
    };
    const onClick = (e: MouseEvent) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } };
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("click", onClick, true);
    update();
    return () => {
      el.removeEventListener("scroll", update);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, []);

  return (
    <div className="strip">
      <div className="strip__track" ref={track} data-cursor="Drag" tabIndex={0} aria-label="Recent work, scroll sideways">
        {gallery.map((g, i) => (
          <figure className="strip__item" key={g.id}>
            <Link href="/gallery" className="strip__img" draggable={false} aria-label={`${caption(g)}, open gallery`}>
              <Image src={g.src} alt={g.alt} fill sizes="(min-width: 768px) 420px, 78vw" quality={76} draggable={false} />
            </Link>
            <figcaption>
              <span className="caption">{caption(g)}</span>
              <span className="strip__num">{String(i + 1).padStart(2, "0")}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="strip__bar" aria-hidden="true"><span ref={bar} /></div>
    </div>
  );
}
