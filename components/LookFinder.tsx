"use client";

import Image from "next/image";
import { useState } from "react";
import { Btn } from "./ui";
import { bookHref, kes, occasions, serviceByCode, vibes, waPhoto, type ServiceCode } from "@/lib/site";
import { priceOf, useSiteData } from "@/lib/useSiteData";

// Two taps -> a suggested look and price. A suggestion only; Betty confirms on WhatsApp.
export default function LookFinder() {
  const [occasion, setOccasion] = useState<string | null>(null);
  const [vibe, setVibe] = useState<string | null>(null);

  const occ = occasions.find((o) => o.id === occasion);
  const code: ServiceCode | null = occ?.fixed ?? (vibe ? vibes.find((v) => v.id === vibe)!.service : null);
  const s = code ? serviceByCode(code) : null;
  const live = useSiteData();

  return (
    <div className="finder">
      <div className="finder__steps">
        <div className="finder__step">
          <span className="caption">1 · What&apos;s the occasion?</span>
          <div className="chips" role="group" aria-label="Occasion">
            {occasions.map((o) => (
              <button key={o.id} type="button" className="chip" aria-pressed={occasion === o.id}
                onClick={() => { setOccasion(o.id); if (o.fixed) setVibe(null); }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {occ && !occ.fixed && (
          <div className="finder__step reveal is-in">
            <span className="caption">2 · How do you want to feel?</span>
            <div className="chips" role="group" aria-label="Vibe">
              {vibes.map((v) => (
                <button key={v.id} type="button" className="chip" aria-pressed={vibe === v.id} onClick={() => setVibe(v.id)}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="finder__alt">
          <span>Already have a photo of the look?</span>
          <Btn href={waPhoto} label="Send it on WhatsApp" small variant="ghost" magnetic={false} />
        </div>
      </div>

      <div className="finder__result" aria-live="polite">
        {s ? (
          <>
            <Image key={s.code} src={s.photo} alt={s.photoAlt} fill sizes="(min-width: 960px) 50vw, 100vw" quality={78} />
            <div className="finder__card">
              <span className="caption">Our suggestion</span>
              <h3>{s.name}</h3>
              <span className="price">{kes(priceOf(live, s.code) ?? s.priceKes)}</span>
              <p style={{ color: "rgba(247,243,238,0.85)", maxWidth: "26rem" }}>{s.line} Betty confirms when you message.</p>
              <Btn href={bookHref(s.code)} label="Book this look" variant="light" />
            </div>
          </>
        ) : (
          <p className="finder__empty">Tap your occasion and we&apos;ll suggest the look and the price.</p>
        )}
      </div>
    </div>
  );
}
