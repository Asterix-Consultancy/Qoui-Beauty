# What Betty needs to fill in

**Most of this is now done by Betty herself in `/admin` → Settings and Reviews** (prices, durations,
hours, days off, deposit, booking rules, M-Pesa details, studio directions, reviews). What's left below.

Everything below is a placeholder in v1. Send these to the developer (or edit the files listed).

## Photos (most important)

All real work, melanin-rich skin, good natural light. No stock photos, no filters.
Send the largest originals; the site compresses them automatically.

The site now uses the 6 real photos and the logo from the original site
(`public/photos/`, `public/logo.png`). Still needed:

| Photo | How many | Where it goes |
|---|---|---|
| **A real bridal photo**: the Bridal card temporarily uses `terracotta-smoky-closed.jpg` | 1+ | `lib/site.ts` → `services[2].photo`, plus `gallery[]` with `service: "bridal"` |
| More gallery photos (the Bridal filter shows "coming soon" until there's one) | 6+ | `lib/site.ts` → `gallery[]` |
| **Confirm captions** for the 6 current photos (occasion + year are guesses) | — | `lib/site.ts` → `gallery[]` |
| Before/after pairs: same client, same light, same angle (section appears automatically once added) | 2–3 pairs | `lib/site.ts` → `results[]` |
| ~~Betty's photo~~: done, About now uses `betty.jpg` | — | — |
| Higher-resolution original of `soft-smoky.jpg` (only 420 px wide) | 1 | `public/photos/` |

Put files in `public/photos/` and reference them as `/photos/name.jpg`.
**Get each client's permission before using her face.**

## Words

- **Testimonials:** 3 real quotes with first name and service (`lib/site.ts` → `testimonials`). We will not invent reviews.
- **Years of experience** (`lib/site.ts` → `studio.yearsExperience`).
- **About text:** check the 2–3 sentences in `app/page.tsx` sound like Betty.
- **Instagram handle** (`lib/site.ts` → `studio.instagram`, `instagramUrl`).
- **Final domain** (`app/layout.tsx` → `metadataBase`).

## Business details

| Item | Where | Current placeholder |
|---|---|---|
| Service durations | `db/seed.sql` (and `lib/site.ts`) | Soft glam 60, Glam 90, Bridal 120 min |
| Travel buffer for house calls | `db/seed.sql` → `travel_buffer_min` | 60 min before and after |
| Deposit amount | `db/seed.sql` → `deposit_amount` | KES 1,000 |
| How long an unpaid booking holds the slot | `db/seed.sql` → `pending_hold_hours` | 12 hours |
| Opening hours per day | `db/seed.sql` → `availability`, `lib/site.ts` → `studio.hours` | Mon–Fri 9–18, Sat 6–18, Sun 6–14 |
| Studio address / directions sent to clients | `db/seed.sql` → `studio_address` | "Qoui Glam Studio, Donholm, Nairobi" |
| What each look includes | `db/seed.sql` → `description` | draft text |
| Prep tip per look (used in reminders) | `db/seed.sql` → `prep_tip` | draft text |
| M-Pesa number and name for deposits | Vercel env `BETTY_MPESA_NUMBER`, `BETTY_MPESA_NAME` | — |
| Betty's personal WhatsApp (for alerts and commands) | Vercel env `BETTY_PHONE` | — |
| Data retention period and response time | `app/privacy/page.tsx` | 24 months, 7 days |

## Questions that should always go to Betty

The assistant already hands these off. Tell us if you want to add or remove any:

- Skin allergies, sensitive skin, skin conditions, pregnancy-related questions
- Complaints or unhappy clients
- Special requests: group/bridal-party bookings, trials, lessons, early-morning or out-of-town travel
- Any price not on the list, discounts, or payment plans
- Changing or cancelling an existing booking
- Refunds
- Anything the assistant isn't sure about

Also tell us: **do you do bridal trials, bridal party packages, or lashes as an add-on?**
If yes, we'll add them to the price list so the assistant can quote them.
