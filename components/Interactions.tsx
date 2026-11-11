"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Site-wide motion, set up once per page:
//  .reveal          fade-up when scrolled into view
//  [data-magnetic]  element leans toward the pointer (fine pointers only)
//  [data-tilt]      card tilts in 3D under the pointer (fine pointers only)
//  [data-parallax]  drifts slower than the page while scrolling
// Everything is skipped when the visitor prefers reduced motion.
export default function Interactions() {
  const pathname = usePathname();

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const cleanups: (() => void)[] = [];

    const reveals = document.querySelectorAll<HTMLElement>(".reveal:not(.is-in)");
    if (reduce || !("IntersectionObserver" in window)) {
      reveals.forEach((el) => el.classList.add("is-in"));
    } else {
      const io = new IntersectionObserver(
        (entries) => entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
        }),
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
      );
      reveals.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    }

    if (fine && !reduce) {
      document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
        const k = Number(el.dataset.magnetic) || 0.25;
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * k}px, ${(e.clientY - r.top - r.height / 2) * k}px)`;
        };
        const leave = () => { el.style.transform = ""; };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", leave);
        cleanups.push(() => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); });
      });

      document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((el) => {
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          el.style.transform = `perspective(900px) rotateX(${-y * 6}deg) rotateY(${x * 6}deg) translateY(-4px)`;
        };
        const leave = () => { el.style.transform = ""; };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", leave);
        cleanups.push(() => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); });
      });
    }

    const par = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    if (!reduce && par.length) {
      let raf = 0;
      const tick = () => {
        raf = 0;
        const vh = window.innerHeight;
        par.forEach((el) => {
          const r = (el.parentElement ?? el).getBoundingClientRect();
          if (r.bottom < 0 || r.top > vh) return;
          const p = (r.top + r.height / 2 - vh / 2) / vh;
          el.style.transform = `translate3d(0, ${p * -(Number(el.dataset.parallax) || 40)}px, 0)`;
        });
      };
      const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
      tick();
      window.addEventListener("scroll", onScroll, { passive: true });
      cleanups.push(() => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); });
    }

    return () => cleanups.forEach((c) => c());
  }, [pathname]);

  return null;
}

// Soft dot + ring cursor. The ring grows and shows a word over [data-cursor="..."] elements.
export function Cursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = ref.current;
    if (!fine || reduce || !root) return;
    const dot = root.querySelector<HTMLElement>(".cursor__dot")!;
    const ring = root.querySelector<HTMLElement>(".cursor__ring")!;
    const label = ring.querySelector("span")!;
    let mx = -100, my = -100, rx = -100, ry = -100, raf = 0;

    const loop = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    const move = (e: PointerEvent) => {
      mx = e.clientX; my = e.clientY;
      const t = e.target as HTMLElement | null;
      const tagged = t?.closest<HTMLElement>("[data-cursor]");
      if (tagged) {
        label.textContent = tagged.dataset.cursor || "";
        root.classList.add("has-label");
        root.classList.remove("is-link");
      } else {
        root.classList.remove("has-label");
        root.classList.toggle("is-link", !!t?.closest("a, button, label, input"));
      }
    };
    const hide = () => { mx = my = -100; };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", hide);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", hide);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="cursor" ref={ref} aria-hidden="true">
      <div className="cursor__ring"><span /></div>
      <div className="cursor__dot" />
    </div>
  );
}
