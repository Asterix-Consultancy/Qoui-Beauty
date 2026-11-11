"use client";

import { useEffect, useState } from "react";
import { houseCallFeeKes, openingHours, services as staticServices, type ServiceCode } from "./site";

// Live values Betty edits in Admin (prices, durations, hours, testimonials). The page renders
// instantly with the built-in defaults, then swaps in the live values from /api/site.
export type SiteData = {
  services: { code: ServiceCode; name: string; price_kes: number; duration_min: number }[];
  house_call_fee_kes: number;
  deposit_kes: number | null;
  hours: Record<string, [string, string] | null>;
  studio_address: string | null;
  whatsapp_number: string;
  testimonials: { quote: string; name: string; service: string }[];
  live: boolean;
};

const fallback: SiteData = {
  services: staticServices.map((s) => ({
    code: s.code, name: s.name, price_kes: s.priceKes,
    duration_min: Number(s.duration.replace(/\D/g, "")) || 60,
  })),
  house_call_fee_kes: houseCallFeeKes,
  deposit_kes: null,
  hours: Object.fromEntries(Object.entries(openingHours).map(([k, v]) => [k, v])),
  studio_address: null,
  whatsapp_number: "254727509719",
  testimonials: [],
  live: false,
};

let cache: SiteData | null = null;
let inflight: Promise<SiteData | null> | null = null;
const listeners = new Set<(d: SiteData) => void>();

function load(): Promise<SiteData | null> {
  if (!inflight) {
    inflight = fetch("/api/site")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !j.ok) return null;
        cache = { ...j, live: true } as SiteData;
        listeners.forEach((fn) => fn(cache!));
        return cache;
      })
      .catch(() => null)
      .finally(() => { setTimeout(() => { inflight = null; }, 30_000); });
  }
  return inflight;
}

export function useSiteData(): SiteData {
  const [data, setData] = useState<SiteData>(cache ?? fallback);
  useEffect(() => {
    listeners.add(setData);
    if (cache) setData(cache);
    else load();
    return () => { listeners.delete(setData); };
  }, []);
  return data;
}

// "254727509719" -> "+254 727 509 719"
export function prettyPhone(digits: string) {
  const d = digits.replace(/\D/g, "");
  return d.startsWith("254") && d.length === 12 ? `+254 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : `+${d}`;
}

export const priceOf = (d: SiteData, code: ServiceCode) => d.services.find((s) => s.code === code)?.price_kes;
export const durationLabel = (min: number) => (min % 60 === 0 ? `${min / 60} hr` : min > 60 ? `${Math.floor(min / 60)} hr ${min % 60} min` : `${min} min`);

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const short = (t: string) => t.replace(/^0/, "");

// "Mon–Fri · 9:00–18:00", grouping consecutive days with the same hours (Monday first).
export function hoursLines(hours: SiteData["hours"]): string[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const lines: string[] = [];
  let i = 0;
  while (i < order.length) {
    const h = hours[String(order[i])];
    let j = i;
    while (j + 1 < order.length && JSON.stringify(hours[String(order[j + 1])]) === JSON.stringify(h)) j++;
    const days = i === j ? DAY[order[i]] : `${DAY[order[i]]}–${DAY[order[j]]}`;
    lines.push(h ? `${days} · ${short(h[0])}–${short(h[1])}` : `${days} · Closed`);
    i = j + 1;
  }
  return lines;
}
