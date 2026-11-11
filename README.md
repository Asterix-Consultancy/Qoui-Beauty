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

## Deploy (website + booking + admin), step by step

1. **GitHub:** the repo is `Asterix-Consultancy/Qoui-Beauty`. Push to it.
2. **Vercel:** Add New → Project → import the repo. Framework is detected as Next.js; the Python files in
   `/api` deploy as functions automatically.
3. **Database:** in the Vercel project open **Storage → Create → Neon (Postgres)** and connect it. This sets
   `DATABASE_URL` for you. Then open Neon's **SQL Editor** and run `db/schema.sql`, then `db/seed.sql`
   (both are safe to re-run; the seed never overwrites Betty's Admin changes).
4. **Environment variables** (Project → Settings → Environment Variables):
   - `APP_ENCRYPTION_KEY`: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
     (set once, never change: it encrypts the authenticator secrets)
   - `ADMIN_BOOTSTRAP_TOKEN`: `openssl rand -hex 24` (one-time code to create the first owner)
   - `PASSWORD_PEPPER`: `openssl rand -hex 24` (set once, never change)
   - `CRON_SECRET`: `openssl rand -hex 24` (the daily job uses it)
   - leave `WHATSAPP_ENABLED` unset for now
5. **Deploy.** Check `https://<app>.vercel.app/api/health`.
6. **Create the owner account:** open `https://<app>.vercel.app/admin`, enter the `ADMIN_BOOTSTRAP_TOKEN`,
   your name, email and a password, scan the QR code with an authenticator app (Google Authenticator,
   Microsoft Authenticator or Authy) and save the 8 recovery codes. Then invite Betty from **Team**
   (she gets a one-time link, sets her own password and authenticator). Make Betty an owner.
7. **Betty fills Settings:** durations, hours, deposit, rules, **M-Pesa number + name**, studio directions,
   **WhatsApp numbers**. Reviews under Reviews.
8. **Test:** book from your phone at `/book`, paste a test M-Pesa code, then confirm it in `/admin`.

> Vercel Hobby (free) is fine for testing; switch the project to **Pro** before taking real clients
> (Hobby is non-commercial only).

The daily job (`/api/cron/reminders`, 18:00 Nairobi) releases unpaid holds and applies the data-retention
rules from the privacy page (notes/messages after 12 months, booking records after 5 years).

## Admin security (what protects /admin)

| Threat | Protection |
|---|---|
| Stolen or guessed password | Every sign-in needs password **and** a 6-digit code from the user's own authenticator app (TOTP). |
| Brute force | Max 10 failed attempts per network per 15 min; accounts lock after every 5 failures (15 min, doubling up to 24 h); each login code step allows 5 tries. |
| Password reuse / weak passwords | 12+ characters, common and studio-related words blocked, name/email blocked, last 5 passwords can't be reused. |
| Old passwords | Everyone must change their password every 90 days (owner can set 30–365); expired passwords block everything until changed. |
| Database leak | Passwords hashed with scrypt + server-side pepper; authenticator secrets encrypted (APP_ENCRYPTION_KEY); session, invite and recovery tokens stored only as SHA-256 hashes. |
| Code replay | Each authenticator code works once (even under simultaneous requests); recovery codes are single-use. |
| Session theft | Random 256-bit server-side sessions, `__Host-` HttpOnly Secure SameSite=Strict cookie, idle timeout (60 min) and absolute expiry (12 h), revocable per user, all revoked on password change/disable/reset. |
| CSRF / clickjacking | Same-origin check + required custom header on every change; `frame-ancestors 'none'` and `X-Frame-Options: DENY`. |
| XSS / injection | Strict Content-Security-Policy on /admin; React escaping; parameterised SQL everywhere. |
| Account enumeration | Same message and same timing for unknown emails and wrong passwords. |
| Insider misuse | Roles (owner vs staff), owner-only team/settings, at least one owner always kept, full activity log. |
| Leaked invite links | One-time, 48-hour, removed from the address bar on open, never sent as Referer. |

What it can't stop on its own: someone who has both a user's password **and** their unlocked phone, or
malware on their device. Ask staff to keep a screen lock on the phone with the authenticator.

## Later: switching on the WhatsApp assistant

Kept for when it comes back (it may move to qworks instead). Set `WHATSAPP_ENABLED=1` plus the Meta
variables in `.env.example`, then:

You need: a GitHub account, a Vercel account, a Meta (Facebook) account, an Anthropic API key,
and about an hour.

### 1. Database (Neon, free tier is fine to start)

1. Go to https://neon.tech → create a project, region **AWS Europe (Frankfurt)** (closest to Nairobi).
2. Open **Connection details**, tick **Pooled connection**, copy the string. That's your `DATABASE_URL`.
3. On your computer, run the two SQL files (or paste them into Neon's **SQL Editor**, schema first):
   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   psql "$DATABASE_URL" -f db/seed.sql
   ```
4. Edit `db/seed.sql` with Betty's real durations, deposit, hours etc. (see `PLACEHOLDERS.md`) and re-run it any time. It's safe to re-run.

> Supabase works too: use the **Transaction pooler** string (port 6543).

### 2. Meta app and WhatsApp test number

1. Go to https://developers.facebook.com → **My Apps → Create app** → type **Business** → add the **WhatsApp** product.
2. In **WhatsApp → API Setup** you get a free **test number**. Copy:
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - **Temporary access token** → `WHATSAPP_TOKEN` (expires in 24 h; fine for testing)
3. Under **To**, add and verify the phones you'll test with: your own and Betty's.
4. **App settings → Basic → App secret → Show** → `WHATSAPP_APP_SECRET`.
5. Make up a long random string for `WHATSAPP_VERIFY_TOKEN` (e.g. run `openssl rand -hex 24`).

### 3. Deploy to Vercel

1. Push this repo to GitHub (Asterisk-consultancy org), then on https://vercel.com → **Add New → Project** → import it. Vercel detects Next.js; the Python files in `/api` deploy automatically as functions.
2. **Settings → Environment Variables**: add every key from `.env.example` with real values. `CRON_SECRET` is another random string.
3. Deploy. Check `https://<your-app>.vercel.app/api/health` returns `{"ok": true, ...}`. `"database": false` means the `DATABASE_URL` is wrong; `missing_env_count` > 0 means a key is missing.

> **Important:** Vercel's free Hobby plan is for non-commercial use. Switch the project to **Pro** before Betty goes live with real clients.

### 4. Connect the webhook

1. Meta app → **WhatsApp → Configuration → Webhook → Edit**:
   - Callback URL: `https://<your-app>.vercel.app/api/whatsapp`
   - Verify token: the same `WHATSAPP_VERIFY_TOKEN`
2. Click **Verify and save**. (Meta calls the GET endpoint; it answers only if the token matches.)
3. Under **Webhook fields**, subscribe to **messages**.

### 5. Test with the Meta test number

From a phone you verified in step 2.3, send WhatsApp messages to the test number:

| Try | Expect |
|---|---|
| "How much is glam?" | Price from the database + the privacy line (first message only) |
| "I'd like to book bridal" | Studio/house call buttons → date → 3 slot buttons → name → deposit instructions |
| A screenshot-style M-Pesa message with a code | "Sent to Betty" + Betty gets the alert |
| From Betty's phone: `OK 12` | Client gets "You're booked" |
| From Betty's phone: `TODAY`, `TOMORROW`, `BLOCK 2026-12-24`, `HELP` | Lists / confirmation / command list |
| A voice note or sticker | Polite reply, no crash |
| "I'm allergic to some foundations" | Hand-off: client told Betty will reply; Betty gets `Handoff H1 …` and can answer with `REPLY H1 your message` |

Watch **Vercel → Project → Logs** while testing. Phone numbers in logs are masked.

### 6. Submit the message templates

Follow `docs/whatsapp-templates.md`. Reminders (and alerts to Betty when she hasn't messaged
the bot in 24 h) only work once these are **Approved** (usually minutes to a day).

### 7. Go live on Betty's real number

1. Meta **Business Manager**: verify the business, then **WhatsApp → Phone numbers → Add** Betty's business number (it can't be in use on the normal WhatsApp app; WhatsApp Business app numbers can be migrated).
2. Create a **System User** with a **permanent token** that has `whatsapp_business_messaging` and `whatsapp_business_management`; put it in `WHATSAPP_TOKEN`. Update `WHATSAPP_PHONE_NUMBER_ID`.
3. `BETTY_PHONE` must be Betty's **personal** WhatsApp, not the business number.
4. Switch Vercel to **Pro**, update the website's WhatsApp number in `lib/site.ts` if it changed, redeploy.

### Local development (website + booking on localhost)

```bash
# 1. A local Postgres (its own container + volume, port 55433)
docker run -d --name qoui-dev-pg --restart unless-stopped -m 256m \
  -e POSTGRES_PASSWORD=qoui_local -e POSTGRES_DB=qoui \
  -v qoui-dev-pgdata:/var/lib/postgresql/data -p 127.0.0.1:55433:5432 postgres:16-alpine
docker exec -i qoui-dev-pg psql -U postgres -d qoui < db/schema.sql
docker exec -i qoui-dev-pg psql -U postgres -d qoui < db/seed.sql

# 2. .env.local (gitignored) with at least:
#    DATABASE_URL=postgresql://postgres:qoui_local@127.0.0.1:55433/qoui
#    WHATSAPP_DRY_RUN=1   (logs WhatsApp messages instead of sending)
#    BETTY_PHONE, BETTY_MPESA_NUMBER, BETTY_MPESA_NAME, CRON_SECRET

# 3. Two terminals
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/dev_api.py   # Python API on :3001
npm install && npm run dev            # website on http://localhost:3000 (proxies /api to :3001)
```

On Vercel none of this is needed: the `/api/*.py` files deploy as functions automatically.
Run `db/schema.sql` again on an existing database to add the v1.1 booking columns (it's safe to re-run).

---

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

## How the assistant behaves (and what keeps it safe)

- **One source of truth:** prices, durations, fees, deposit and hours are read from the
  database by tools. The prompt never contains prices; the assistant is told never to quote from memory.
- **No invented availability:** `get_free_slots` checks opening hours, blocked days, existing
  bookings, service duration and the house-call travel buffer (before and after). Bookings can
  only be created for a slot that check returns.
- **No double-booking, ever:** a Postgres exclusion constraint rejects overlapping bookings even if
  two clients tap the same slot at the same second.
- **Unpaid holds expire** after `pending_hold_hours` (default 12) so slots aren't blocked forever.
- **Only Betty confirms.** The assistant creates PENDING bookings; Betty's `OK 12` confirms.
- **M-Pesa codes** must be 10 letters/digits and can only be used once across all bookings.
- **Webhook security:** every POST must carry a valid `X-Hub-Signature-256`; messages are
  de-duplicated by WhatsApp message id; messages older than 1 hour are ignored.
- **Failures:** if Claude or the database fails, the client gets "Betty will reply shortly" and
  Betty gets an alert. Unknown message types (voice notes, stickers, video) get a polite reply.
- **Images** are held in memory only long enough for Claude to look at them; never stored.
- **Privacy:** first message to every new client includes "We only use your details for your bookings."
- **Processing time:** replies are generated before the webhook returns (serverless functions freeze
  after responding). Function timeout is 60 s. If Meta retries meanwhile, the duplicate is skipped.

### Betty's commands (from her own WhatsApp)

| Send | Does |
|---|---|
| `OK 12` | Confirm booking 12 and message the client |
| `NO 12` | Cancel booking 12 and politely tell the client (reminds Betty to refund a deposit) |
| `TODAY` / `TOMORROW` (or `LEO` / `KESHO`) | List bookings |
| `BLOCK 2026-12-24 [reason]` / `UNBLOCK 2026-12-24` | Day off / reopen |
| `REPLY 12 message` | Send her message to the client of booking 12 |
| `REPLY H5 message` | Answer hand-off 5 (and close it) |
| `DONE H5` | Close hand-off 5 without replying |
| anything else | Command list |

### Costs to expect

- Claude: `CLAUDE_MODEL` defaults to `claude-opus-5-5` with low effort. For a small studio's
  volume this is modest; `claude-sonnet-5-5` or `claude-haiku-5-5` are cheaper if needed.
- WhatsApp: replies within 24 h of a client message are free; utility templates (reminders) are
  charged per message by Meta at Kenyan rates.
- Neon free tier, Vercel Pro (required for commercial use).

---

## Version 2 (designed for, not built)

- **M-Pesa STK push (Daraja)** once Betty has a Till/Paybill: replace `record_deposit_code` with
  an `request_deposit` tool that triggers STK push, plus a `/api/mpesa/callback` endpoint that sets
  `deposit_claimed` automatically. `bookings.mpesa_code` and its unique index already fit.
- **Website chat** using the same assistant: a `/api/chat` endpoint calling `claude_agent.respond`
  with a web session id in place of the WhatsApp number.
- **Admin dashboard** for Betty (bookings calendar, blocked days, handoffs). All data is already in
  Postgres; add auth (e.g. magic link) and read-only pages first.
- **Rebooking nudges** (a template ~6 weeks after `completed`) and an **Instagram caption helper**.

## Next steps

1. **Push** to `Asterix-Consultancy/Qoui-Beauty` and deploy to Vercel (steps above). The repo is public: never commit `.env*` files.
2. **Betty fills Admin → Settings**: real durations, opening hours, deposit, M-Pesa number + name,
   studio directions. Then adds 3+ real client reviews (with their permission).
3. **Domain:** buy/point the domain (e.g. qouiglamstudio.co.ke) in Vercel → Domains; update
   `metadataBase` in `app/layout.tsx`.
4. **Bridal photos** and more gallery work in `public/photos` + `lib/site.ts`.
5. **Vercel Pro** before real clients.
6. **On hold → qworks:** the WhatsApp assistant (`api/whatsapp.py`, `api/_lib/claude_agent.py`,
   `tools.py`, `betty_commands.py`) and automatic M-Pesa (Daraja STK push once Betty has a Till/Paybill).
   Until then: clients pay manually and paste the code; Betty confirms in Admin.
7. **Privacy page:** have a Kenyan lawyer give the retention periods and response times a final check
   (currently: booking/payment records 5 years per the Tax Procedures Act; notes/messages 12 months;
   access requests 7 days, correction/deletion 14 days under the 2021 Regulations).
