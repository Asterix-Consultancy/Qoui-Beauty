// Single place for the website's content. Anything in [brackets] is a placeholder
// Betty must fill in (see PLACEHOLDERS.md).
//
// Prices here are for DISPLAY on the static site only. The WhatsApp assistant reads
// prices from the database (services/settings tables) - keep the two in step.

export const studio = {
  name: "Qoui Glam Studio",
  owner: "Betty",
  area: "Donholm, Nairobi",
  established: "2025",
  // Default only: the live number is set in Admin → Settings → WhatsApp.
  whatsappE164: "254727509719",
  whatsappDisplay: "+254 727 509 719",
  email: "qouiglamstudio@gmail.com",
  instagram: "@qouiglamstudio",
  instagramUrl: "https://www.instagram.com/qouiglamstudio",
  makeupSince: 2021,
  bettyPhoto: "/photos/betty.jpg",
};

// Default opening hours shown until the live hours (Admin → Settings) load. 0 = Sunday (JS getDay()).
export const openingHours: Record<number, [string, string] | null> = {
  0: ["06:00", "14:00"],
  1: ["09:00", "18:00"],
  2: ["09:00", "18:00"],
  3: ["09:00", "18:00"],
  4: ["09:00", "18:00"],
  5: ["09:00", "18:00"],
  6: ["06:00", "18:00"],
};
export const hoursText = ["Mon–Fri · 9:00–18:00", "Sat · 6:00–18:00", "Sun · 6:00–14:00"];

export type ServiceCode = "soft_glam" | "glam" | "bridal";

export type Service = {
  code: ServiceCode;
  name: string;
  priceKes: number;
  duration: string;
  line: string;
  photo: string;
  photoAlt: string;
};

export const services: Service[] = [
  {
    code: "soft_glam",
    name: "Soft glam",
    priceKes: 3000,
    duration: "60 min",
    line: "Skin that looks like skin. Soft definition for dinners, birthdays and day events.",
    photo: "/photos/braids-soft-glam.jpg",
    photoAlt: "Client with braids wearing soft glam makeup",
  },
  {
    code: "glam",
    name: "Glam",
    priceKes: 4500,
    duration: "90 min",
    line: "Full coverage, sculpted and lashed. Built to last the whole night.",
    photo: "/photos/red-wrap-glam.jpg",
    photoAlt: "Smiling client in a red head wrap with red glam eyeshadow",
  },
  {
    code: "bridal",
    name: "Bridal",
    priceKes: 6000,
    duration: "120 min",
    line: "Your face, on your biggest day. Long-wear, photo-ready, tear-proof.",
    photo: "/photos/terracotta-smoky-closed.jpg", // [placeholder: replace with a real bridal photo]
    photoAlt: "Close-up of a blended, long-wear eye look with lashes",
  },
];

export const houseCallFeeKes = 1500;

export const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

export function waLink(message: string) {
  // Goes through /api/wa, which redirects to the number currently set in Admin.
  return `/api/wa?text=${encodeURIComponent(message)}`;
}

export const waBook = (service?: Service, houseCall = false) =>
  waLink(
    service
      ? `Hi Qoui, I'd like to book ${service.name}${houseCall ? " as a house call" : ""}.`
      : "Hi Qoui, I'd like to book an appointment.",
  );

export const waPhoto = waLink("Hi Qoui, I have a photo of a look I love. Which service is it?");

export type GalleryItem = {
  id: string;
  service: ServiceCode;
  occasion: string;
  year: string;
  src: string;
  alt: string;
  w: number;
  h: number;
};

// Real work from the original site. [placeholder: confirm occasion + year for each]
export const gallery: GalleryItem[] = [
  { id: "g1", service: "glam", occasion: "Terracotta smoky eye", year: "2025", src: "/photos/terracotta-smoky.jpg", alt: "Client with a terracotta smoky eye and nude gloss", w: 1527, h: 2000 },
  { id: "g2", service: "glam", occasion: "Photoshoot", year: "2025", src: "/photos/red-wrap-glam.jpg", alt: "Smiling client in a red head wrap with red glam eyeshadow", w: 853, h: 1280 },
  { id: "g3", service: "soft_glam", occasion: "Editorial", year: "2025", src: "/photos/braids-soft-glam.jpg", alt: "Client with long braids wearing soft sculpted makeup", w: 960, h: 1280 },
  { id: "g4", service: "glam", occasion: "Eyes closed detail", year: "2025", src: "/photos/terracotta-smoky-closed.jpg", alt: "Close-up of a blended terracotta and black smoky eye with lashes", w: 1414, h: 2000 },
  { id: "g6", service: "soft_glam", occasion: "Soft smoky portrait", year: "2025", src: "/photos/soft-smoky.jpg", alt: "Client with a soft smoky eye and pink nude lip", w: 420, h: 594 },
];

export const serviceByCode = (code: ServiceCode) => services.find((s) => s.code === code)!;

export const caption = (g: GalleryItem) => `${serviceByCode(g.service).name} · ${g.occasion} · ${g.year}`;

// Before/after pairs: same client, same light. The section only shows once real pairs exist.
export const results: { id: string; label: string; before: string; after: string }[] = [];

// Testimonials live in the database and are managed in Admin → Reviews (never invented here).

// Look finder: occasion -> vibe -> suggested service. Betty confirms on WhatsApp.
export const occasions = [
  { id: "bride", label: "I'm the bride", fixed: "bridal" as ServiceCode },
  { id: "guest", label: "Wedding guest" },
  { id: "shoot", label: "Photoshoot" },
  { id: "night", label: "Birthday / night out" },
  { id: "grad", label: "Graduation" },
  { id: "work", label: "Work or headshots" },
];
export const vibes = [
  { id: "natural", label: "Natural, like me but better", service: "soft_glam" as ServiceCode },
  { id: "bold", label: "Bold, full glam", service: "glam" as ServiceCode },
];

// Website booking flow (/book). Prefills the look and place when given.
export const bookHref = (service?: ServiceCode, houseCall = false) => {
  const q = new URLSearchParams();
  if (service) q.set("service", service);
  if (houseCall) q.set("location", "house_call");
  const s = q.toString();
  return `/book${s ? `?${s}` : ""}`;
};
