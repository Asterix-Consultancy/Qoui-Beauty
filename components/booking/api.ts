// Typed calls to the booking API (/api/*.py). Every call returns {ok:false,...} instead of throwing.

export type Svc = { code: string; name: string; price_kes: number; duration_min: number; includes: string };
export type Meta = {
  services: Svc[];
  house_call_fee_kes: number;
  deposit_kes: number;
  hold_hours: number;
  min_date: string;
  max_date: string;
  today: string;
};
export type DayStatus = "available" | "limited" | "full" | "closed" | "blocked" | "past" | "too_far";
export type Day = { date: string; status: DayStatus; free: number };
export type Slot = { start_time: string; label: string; available: boolean; reason: null | "taken" | "too_soon" };
export type SlotsResp = { date: string; day_status: string | null; message: string | null; slots: Slot[] };
export type Booking = {
  booking_id: number;
  status: string;
  service: string;
  service_code: string;
  location_type: "studio" | "house_call";
  address: string | null;
  start_time: string;
  end_time: string;
  label: string;
  total_kes: number;
  deposit_kes: number;
  mpesa_number: string;
  mpesa_name: string;
  hold_hours: number;
  studio_address: string;
  studio_directions: string;
  token: string;
};

export type Fail = { ok: false; status: number; error: string; message: string };
export type Ok<T> = { ok: true } & T;

async function call<T>(url: string, init?: RequestInit): Promise<Ok<T> | Fail> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { /* non-JSON (e.g. proxy error) */ }
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        status: res.status,
        error: String(data.error ?? "network"),
        message: String(data.message ?? "We couldn't reach the booking system. Check your connection and try again."),
      };
    }
    return data as Ok<T>;
  } catch {
    return { ok: false, status: 0, error: "network", message: "You seem to be offline. Check your connection and try again." };
  }
}

export const getMeta = () => call<Meta>("/api/services");
export const getMonth = (service: string, location: string, month: string) =>
  call<{ month: string; days: Day[] }>(`/api/availability?service=${service}&location=${location}&month=${month}`);
export const getSlots = (service: string, location: string, date: string) =>
  call<SlotsResp>(`/api/slots?service=${service}&location=${location}&date=${date}`);
export const createBooking = (body: Record<string, unknown>) =>
  call<{ booking: Booking }>("/api/bookings", { method: "POST", body: JSON.stringify(body) });
export const sendDeposit = (booking_id: number, token: string, mpesa_code: string) =>
  call<{ booking_id: number; status: string; mpesa_code: string }>("/api/deposit", {
    method: "POST",
    body: JSON.stringify({ booking_id, token, mpesa_code }),
  });

// ---------------------------------------------------------------- date helpers (calendar maths in UTC so the
// visitor's own timezone never shifts a day; all times shown come from the server in Nairobi time)

export const ym = (d: string) => d.slice(0, 7);
export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
export function dayLabel(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}
export function mondayOffset(month: string) {
  const [y, m] = month.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
}
export const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

export function normalisePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-().]/g, "");
  const m = s.match(/^(?:\+?254|0)?([17]\d{8})$/);
  if (m) return `254${m[1]}`;
  if (/^\+[1-9]\d{7,14}$/.test(s) && !s.startsWith("+254")) return s.slice(1);
  return null;
}

export function icsFor(b: Booking, where: string) {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Qoui Glam Studio//Booking//EN", "BEGIN:VEVENT",
    `UID:qoui-${b.booking_id}@qouiglamstudio`, `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(b.start_time)}`, `DTEND:${fmt(b.end_time)}`,
    `SUMMARY:${b.service} with Qoui Glam Studio (pending)`,
    `LOCATION:${where.replace(/[,;]/g, " ")}`,
    `DESCRIPTION:Booking #${b.booking_id}. Pending until Betty confirms your deposit.`,
    "END:VEVENT", "END:VCALENDAR",
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
}
