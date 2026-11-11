"use client";

import { useEffect, useRef } from "react";
import { BrushArt } from "./Brush";

// The hero's signature moment: a makeup brush sweeps across the page and leaves a powdery
// blush stroke behind the headline and photo, then rests and drifts with the pointer.
// Two layers share one coordinate system: the stroke sits behind the content, the brush above it.

const PATHS = {
  wide: { view: "0 0 1440 900", d: "M60 720 C330 600 560 800 820 640 S1120 430 1250 470", end: [1250, 470] },
  tall: { view: "0 0 400 560", d: "M-30 330 C70 260 160 360 250 290 S350 190 372 175", end: [372, 175] },
};

function Layer({ kind, part }: { kind: keyof typeof PATHS; part: "stroke" | "brush" }) {
  const p = PATHS[kind];
  return (
    <svg className={`paint paint--${part} paint--${kind}`} viewBox={p.view} preserveAspectRatio={kind === "wide" ? "xMidYMid slice" : "xMidYMin meet"} aria-hidden="true">
      {part === "stroke" ? (
        <>
          <defs>
            <filter id={`powder-${kind}`} x="-5%" y="-30%" width="110%" height="160%">
              <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="7" />
              <feDisplacementMap in="SourceGraphic" scale="26" />
              <feGaussianBlur stdDeviation="1.2" />
            </filter>
            <linearGradient id={`blush-${kind}`} x1="0" x2="1">
              <stop offset="0" stopColor="#e7a99c" />
              <stop offset="0.6" stopColor="#c96f5c" />
              <stop offset="1" stopColor="#d4a24c" />
            </linearGradient>
          </defs>
          <path className="paint__line" d={p.d} pathLength={1} stroke={`url(#blush-${kind})`} filter={`url(#powder-${kind})`} />
        </>
      ) : (
        <g className="paint__mover" style={{ offsetPath: `path("${p.d}")` } as React.CSSProperties}>
          <g className="paint__puff">
            <circle r="18" /><circle r="30" /><circle r="44" />
          </g>
          <g className="paint__lean">
            <g transform={kind === "wide" ? "rotate(38) scale(0.62) translate(-60 -520)" : "rotate(38) scale(0.26) translate(-60 -520)"}>
              <BrushArt id={`hero-${kind}`} />
            </g>
          </g>
        </g>
      )}
    </svg>
  );
}

export default function HeroPaint() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = () => el.classList.add(reduce ? "is-done" : "is-painting");
    const w = window as unknown as { __qouiReady?: boolean };
    if (w.__qouiReady) start();
    else window.addEventListener("qoui:ready", start, { once: true });

    // After the stroke, the resting brush leans toward the pointer.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        el.style.setProperty("--lean-x", `${x * 14}px`);
        el.style.setProperty("--lean-y", `${y * 10}px`);
        el.style.setProperty("--lean-r", `${x * 6}deg`);
      });
    };
    if (fine && !reduce) window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("qoui:ready", start); window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className="hero-paint" ref={root} aria-hidden="true">
      <Layer kind="wide" part="stroke" />
      <Layer kind="tall" part="stroke" />
      <div className="hero-paint__top">
        <Layer kind="wide" part="brush" />
        <Layer kind="tall" part="brush" />
      </div>
    </div>
  );
}

export { PATHS };
