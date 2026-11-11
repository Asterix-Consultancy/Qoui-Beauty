# Qoui Glam Studio: website + WhatsApp booking assistant (v1)

A calm, editorial website for Qoui Glam Studio (Donholm, Nairobi) and **Qoui Assistant**, a
WhatsApp assistant that answers clients instantly, suggests looks and books appointments
while Betty is working. Betty confirms every booking herself, from her own WhatsApp.

```
Visitor ──/book (website)──▶ /api/services · /api/availability · /api/slots · /api/bookings · /api/deposit
                                   └──────── same booking rules + Postgres as the assistant ────────┘
Client ──WhatsApp──▶ Meta Cloud API ──webhook──▶ /api/whatsapp (Python, Vercel)
                                                   │  verify signature, de-duplicate
                                                   ├─ Betty's number? → betty_commands (OK / NO / TODAY …)
                                                   └─ client → Claude + tools ─▶ Postgres (slots, bookings)
                                                                       └─▶ reply / buttons / alert Betty
Vercel Cron (18:00 daily) ──▶ /api/cron/reminders ──▶ reminder template to tomorrow's clients
Website (Next.js, static) ──"Book" buttons──▶ wa.me link with a prefilled message
```

| Path | What it is |
|---|---|
| `app/`, `components/`, `lib/site.ts` | Website: Home, Book, Gallery, Contact, Privacy. All content lives in `lib/site.ts`. |
| `components/booking/` | The booking flow: steps, interactive calendar, time picker, deposit screen |
| `api/services.py`, `availability.py`, `slots.py`, `bookings.py`, `deposit.py` | Website booking API |
| `api/_lib/booking.py` | The one place that decides free times; used by both the website and WhatsApp |
| `scripts/dev_api.py` | Local development only: runs the Python API on :3001 behind `next dev` |
| `api/whatsapp.py` | WhatsApp webhook (verification + incoming messages) |
| `api/cron/reminders.py` | Daily reminders + releases unpaid holds |
| `api/health.py` | Status check |
| `api/_lib/` | Shared code: `db.py`, `whatsapp.py`, `claude_agent.py`, `tools.py`, `betty_commands.py`, `notify.py`, `config.py` |
| `db/schema.sql`, `db/seed.sql` | Database tables and starting data |
| `docs/DESIGN.md`, `docs/mockups.html` | Design system and WhatsApp conversation mockups |
| `docs/whatsapp-templates.md` | The 3 templates to submit to Meta |
| `PLACEHOLDERS.md` | Everything Betty must fill in |

---

## Current mode: direct booking + Admin (v1.3)

- Clients book on the website (`/book`), pay the deposit by M-Pesa themselves and paste the code.
- **Betty runs everything from `/admin`**: sees new bookings and M-Pesa codes, confirms or cancels
  (one tap opens WhatsApp with the message to the client pre-written), adds client reviews, and edits
  prices, durations, opening hours, days off, booking rules, M-Pesa details and studio directions.
  Changes show on the website and booking calendar within about a minute, no redeploy.
- The WhatsApp assistant and automatic M-Pesa are **on hold** (moving to qworks). The code stays in the
  repo, switched off with `WHATSAPP_ENABLED=0`. See *Next steps* at the bottom.


## Website booking flow (/book)

Look → place (studio or house call + address) → date & time → details → confirm → deposit.

- **Live calendar:** every day shows free (green dots), few left (amber), fully booked (struck through),
  closed/away (striped) or past. Swipe or use the arrows to change month; arrow keys move between days.
- **Times:** all start times for the day are shown. Unavailable ones stay visible, struck through, marked
  "Taken" (booked, or Betty travelling to a house call) or "Too soon" (inside the minimum notice).
- **Prices** come from the database. The summary card updates as the visitor chooses.
- **If the time is taken while they're booking**, they're sent back to the calendar with a message and
  fresh availability. The database's overlap guard makes double-booking impossible either way.
- **Confirmation screen:** booking number, M-Pesa deposit instructions with a copy button, a box to paste
  the M-Pesa code (sent straight to Betty for OK/NO), "Add to calendar" and a WhatsApp link.
- **Betty** gets a WhatsApp alert for every web booking ("waiting for deposit"), then the usual
  `New booking #12 … Reply OK 12 or NO 12` once the code arrives. Her commands work the same for both channels.
- **Safety:** same-origin POSTs only, a hidden honeypot field for bots, max 5 bookings per visitor IP per
  hour (IP stored only as a salted hash), max 3 open bookings per phone, Kenyan phone validation, and the
  deposit form only works with a one-time secret given to the browser that made the booking.


