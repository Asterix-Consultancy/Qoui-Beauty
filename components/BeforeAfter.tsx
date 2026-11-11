"use client";

import Image from "next/image";
import { useState } from "react";

// Drag (or arrow-key) slider. A native range input sits on top, so touch, mouse,
// keyboard and screen readers all work without custom gesture code.
export default function BeforeAfter({ label, before, after }: { label: string; before: string; after: string }) {
  const [pos, setPos] = useState(50);

  return (
    <figure style={{ margin: 0 }}>
      <div className="ba" style={{ ["--pos" as string]: `${pos}%` }} data-cursor="Drag">
        <div className="ba__layer"><Image src={before} alt={`${label} client before makeup`} fill sizes="(min-width: 900px) 33vw, 100vw" /></div>
        <div className="ba__layer ba__after"><Image src={after} alt={`${label} client after makeup`} fill sizes="(min-width: 900px) 33vw, 100vw" /></div>
        <span className="ba__tag ba__tag--before">Before</span>
        <span className="ba__tag ba__tag--after">After</span>
        <div className="ba__handle" aria-hidden="true" />
        <input className="ba__range" type="range" min={0} max={100} value={pos}
          onChange={(e) => setPos(Number(e.target.value))} aria-label={`${label}: drag to compare before and after`} />
      </div>
      <figcaption className="caption" style={{ marginTop: "0.85rem" }}>{label}</figcaption>
    </figure>
  );
}
