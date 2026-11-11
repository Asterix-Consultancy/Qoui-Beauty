"use client";

import { useEffect, useRef, useState } from "react";
import { Brush } from "./Brush";
import Logo from "./Logo";

// First-visit loader: a brush sweeps a blush stroke across the screen, the logo appears on it,
// then the curtain lifts. Once per browser session; skipped for reduced motion.
// The site fires "qoui:ready" when the loader is gone so the hero can start its own brush.
export default function Loader() {
  const [phase, setPhase] = useState<"show" | "leave" | "gone">("show");
  const [pct, setPct] = useState(0);
  const started = useRef(performance.now());

  useEffect(() => {
    const root = document.documentElement;
    const done = () => {
      (window as unknown as { __qouiReady?: boolean }).__qouiReady = true;
      window.dispatchEvent(new Event("qoui:ready"));
    };
    if (root.classList.contains("no-loader")) {
      setPhase("gone");
      done();
      return;
    }
    try { sessionStorage.setItem("qoui-loaded", "1"); } catch { /* private mode */ }

    let raf = 0;
    let loaded = document.readyState === "complete";
    const onLoad = () => { loaded = true; };
    window.addEventListener("load", onLoad);
    const MIN = 1900; // let the brush finish its stroke
    const tick = () => {
      const t = performance.now() - started.current;
      const target = loaded ? 100 : Math.min(90, (t / MIN) * 90);
      setPct((p) => Math.min(100, Math.max(p, Math.round(Math.min(target, (t / MIN) * 100)))));
      if (loaded && t >= MIN) {
        setPct(100);
        setPhase("leave");
        setTimeout(() => { setPhase("gone"); done(); }, 900);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const safety = setTimeout(() => { setPhase("gone"); done(); }, 6000);
    return () => { cancelAnimationFrame(raf); clearTimeout(safety); window.removeEventListener("load", onLoad); };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("is-loading", phase === "show");
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div className={`loader${phase === "leave" ? " is-leaving" : ""}`} role="status" aria-live="polite" aria-label="Loading Qoui Glam Studio">
      <div className="loader__stage">
        <svg className="loader__stroke" viewBox="0 0 600 160" aria-hidden="true">
          <defs>
            <filter id="powder" x="-10%" y="-40%" width="120%" height="180%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
              <feDisplacementMap in="SourceGraphic" scale="14" />
            </filter>
          </defs>
          <path d="M30 104 C130 60 200 130 300 88 S470 46 570 70" pathLength={1} />
        </svg>
        <div className="loader__brush"><Brush id="loader-brush" /></div>
        <div className="loader__logo"><Logo size="xl" /></div>
      </div>
      <div className="loader__meta">
        <span>Prepping your glow</span>
        <span className="loader__pct">{String(pct).padStart(3, "0")}</span>
      </div>
    </div>
  );
}
