"use client";

import Image from "next/image";
import { useState } from "react";
import { Btn } from "./ui";
import { bookHref, kes, services } from "@/lib/site";
import { durationLabel, useSiteData } from "@/lib/useSiteData";

// Service cards with a live "House call" switch. Prices and durations come from Admin.
export default function Services() {
  const [houseCall, setHouseCall] = useState(false);
  const live = useSiteData();
  const houseCallFeeKes = live.house_call_fee_kes;

  return (
    <>
      <div className="svc-tools">
        <label className="switch">
          <input type="checkbox" checked={houseCall} onChange={(e) => setHouseCall(e.target.checked)} />
          <span className="switch__track" aria-hidden="true" />
          <span>House call <span className="muted" style={{ fontWeight: 400 }}>(+ {kes(houseCallFeeKes)})</span></span>
        </label>
        <span className="muted" style={{ fontSize: "0.9rem" }} aria-live="polite">
          {houseCall ? "Betty comes to you, anywhere in Nairobi." : "At the studio in Donholm."}
        </span>
      </div>
      <div className="cards">
        {services.map((s) => {
          const ls = live.services.find((x) => x.code === s.code);
          if (live.live && !ls) return null; // look switched off in Admin
          const price = (ls?.price_kes ?? s.priceKes) + (houseCall ? houseCallFeeKes : 0);
          return (
            <article key={s.code} className="card reveal" data-tilt>
              <div className="card__media" data-cursor="Book">
                <span className="card__tag">{durationLabel(ls?.duration_min ?? 60)}</span>
                <Image src={s.photo} alt={s.photoAlt} fill sizes="(min-width: 900px) 33vw, 100vw" quality={78} />
              </div>
              <div className="card__body">
                <div className="card__top">
                  <h3>{ls?.name ?? s.name}</h3>
                  <span className="card__price">
                    <span className="price"><span key={price} className="price-flip">{kes(price)}</span></span>
                    <small>{houseCall ? "incl. house call" : "at the studio"}</small>
                  </span>
                </div>
                <p>{s.line}</p>
                <div style={{ marginTop: "0.25rem" }}>
                  <Btn href={bookHref(s.code, houseCall)} label="Book this look" small variant="ghost" magnetic={false} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
