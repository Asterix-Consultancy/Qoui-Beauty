# Qoui Glam Studio: design system (v1)

Soft luxury, editorial, quiet. The faces are the colour; the interface stays out of the way.
Visual reference: open `docs/mockups.html` in a browser (tokens, components and WhatsApp flows).

## Principles

1. **The work is the hero.** Big real photos, short words, lots of ivory space.
2. **One action per section.** Every section ends with one button, nearly always "Book on WhatsApp".
3. **Rose clay means "do something" or "this costs".** Buttons, links and prices only.
4. **One gentle motion at a time.** Fade-up on scroll, a slow hover zoom on cards, the before/after drag. Nothing else moves. All of it switches off when the visitor has reduced motion turned on.
5. **No** emojis, glitter, sparkles, robot icons, stock photos, busy patterns, or "AI-powered" wording.

## Colour tokens

| Token | Hex | Use | Contrast on Ivory |
|---|---|---|---|
| `--ivory` | `#F7F3EE` | Page background | — |
| `--sand` | `#EDE4D9` | Alternate sections, photo placeholders | — |
| `--cocoa` | `#2B1E1A` | Headings, body text, footer background | 14.6 : 1 (12.8 on Sand) |
| `--muted` | `#6E5E57` | Secondary text, captions | 5.6 : 1 (4.9 on Sand) |
| `--rose` | `#A85A4E` | Buttons, links, prices | 4.5 : 1 on Ivory (AA); white text on rose 5.0 : 1 |
| `--rose-hover` | `#8C473D` | Hover/pressed; rose TEXT on Sand | 6.2 : 1 (5.4 on Sand) |

**Contrast rule:** rose `#A85A4E` as text on Sand is only 3.9 : 1 and fails AA, so on Sand
sections prices and text links use `--rose-hover`. Filled rose buttons are fine everywhere.
| `--blush` | `#F3E3DF` | Selected filter, badges | — |

## Typography

| Role | Font | Size (mobile → desktop) | Weight |
|---|---|---|---|
| Display (hero) | Cormorant Garamond | 44 → 96 px, line-height 1.05 | 500 |
| H2 section | Cormorant Garamond | 32 → 56 px | 500 |
| H3 card | Cormorant Garamond | 24 → 30 px | 500 |
| Quote | Cormorant Garamond | 24 px, line-height 1.3 | 400 |
| Body | Inter | 16 px, line-height 1.6 | 400 |
| Lead | Inter | 17 px, muted | 400 |
| Button | Inter | 13 px, uppercase, +0.14em | 500 |
| Caption | Inter | 11 px, uppercase, +0.2em, muted | 500 |

Two sans weights only (400, 500). Headlines kept to one short line where possible.

## Layout

- Mobile-first at 375 px with a 16 px gutter; 40 px gutter from 768 px; content max 1280 px.
- Section padding scales 72 → 144 px.
- Sticky bottom bar on mobile (< 768 px) with one full-width "Book on WhatsApp" button; hidden on desktop, where "Book" sits in the header.

## Components

**Buttons**
- Primary: rose fill, white text, 48 px tall, 2 px radius. One per section.
- Secondary: cocoa outline → fills cocoa on hover. Used for "See the gallery".
- Text link button: rose with underline, used inside cards ("Book this look").
- On photos: white outline ("See the gallery" in the hero).

**Service card**: 4:5 photo (slow 3% zoom on hover) → name (serif) and price (rose) on one line → one-line description → "Book this look" text button that opens WhatsApp with the service prefilled.

**Gallery caption**: under every photo, small caps, `LOOK · OCCASION · YEAR`, e.g. `BRIDAL · GARDEN WEDDING · 2026`.

**Gallery spread**: landscape photos run full width; portrait photos take 62% width on desktop, alternating left/right like a magazine. Every 3 photos: a "Love this look? / Book this look: KES 4,500" strip. Tap a photo for a full-screen lightbox (swipe, arrow keys, Esc).

**Filter chips**: All / Soft glam / Glam / Bridal; pill outline, blush fill with a rose border when selected (`aria-pressed`).

**Before/after slider**: 4:5 frame, after-photo revealed from the right, white 1 px divider with a 40 px ring handle, "BEFORE"/"AFTER" captions in the corners. Driven by a native range input, so drag, tap, keyboard arrows and screen readers all work.

**Photo placeholder**: warm sand gradient labelled `PHOTO · <what goes here>` so it's obvious which real photo is missing.

## Screens

| Screen | Sections |
|---|---|
| Home | Hero → Services (sand) → Not sure which look → Gallery preview → Real results (sand) → Testimonials → About (sand) → How booking works → Footer |
| Gallery | Title → filter chips → spreads with captions and inline book strips → lightbox |
| Contact | WhatsApp, phone, email, studio area, hours, one button; map of Donholm |
| Privacy | What we keep, why, who helps us, how long, your rights (Kenya Data Protection Act 2019) |

Run `npm run dev` and open http://localhost:3000 at 375 px and 1440 px widths to review each screen.

## Assistant voice

"Qoui Assistant". Warm, short (1–3 sentences), light Kenyan English, mirrors Swahili/Sheng.
Never claims to be human ("I'm Qoui's booking assistant. Betty can reply too.").
The website never says "chatbot" or "AI-powered"; it says "our assistant replies straight away".
