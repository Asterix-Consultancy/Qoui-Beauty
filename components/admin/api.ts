// Calls to /api/admin/*. Same shape as the public API: never throws, returns {ok:false,...} on failure.

export type AdminBooking = {
  id: number; status: string; source: string | null; service: string; service_code: string;
  client_name: string | null; client_phone: string; location_type: "studio" | "house_call"; address: string | null;
  notes: string | null; start_at: string; label: string; total_kes: number; deposit_kes: number;
  mpesa_code: string | null; created_at: string;
};
export type Svc = { code: string; name: string; price_kes: number; duration_min: number; description: string; active: boolean };
export type DayHours = { weekday: number; open: boolean; start: string; end: string };
export type Settings = {
  services: Svc[];
  rules: Record<string, number>;
  texts: Record<string, string>;
  hours: DayHours[];
  days_off: { day: string; reason: string }[];
};
export type Me = { id: number; email: string; name: string; role: "owner" | "staff"; password_expired: boolean; password_days_left: number | null };
export type TeamUser = {
  id: number; email: string; name: string; role: "owner" | "staff"; active: boolean; totp_enabled: boolean;
  status: "active" | "invited" | "disabled"; locked: boolean; sessions: number; recovery_left: number;
  last_login_at: string | null; password_changed_at: string | null; created_at: string;
};
export type AuditRow = { created_at: string; action: string; detail: string | null; user_name: string | null; device: string | null };
export type Review = { id: number; quote: string; name: string; service: string; visible: boolean; sort: number };
export type Fail = { ok: false; status: number; error: string; message: string };

export async function call<T>(url: string, method = "GET", body?: unknown): Promise<({ ok: true } & T) | Fail> {
  try {
    const res = await fetch(url, {
      method,
      credentials: "same-origin",
      // Custom header + same-origin + SameSite=Strict cookie = no cross-site request forgery.
      headers: { "X-Qoui-Admin": "1", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { /* ignore */ }
    if (!res.ok || data.ok === false) {
      return { ok: false, status: res.status, error: String(data.error ?? "network"), message: String(data.message ?? "Couldn't reach the server. Check your connection.") };
    }
    return data as { ok: true } & T;
  } catch {
    return { ok: false, status: 0, error: "network", message: "You seem to be offline." };
  }
}

export const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
