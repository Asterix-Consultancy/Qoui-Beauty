# WhatsApp message templates (submit to Meta)

WhatsApp only allows free-form messages within **24 hours of the client's last message**.
Anything outside that window must use a template Meta has approved. Submit these three in
**WhatsApp Manager → Message templates → Create template**.

For all three: **Category: Utility**, **Language: English** (code `en`; if you choose
"English (UK)" set `TEMPLATE_LANG=en_GB`). Names must match exactly.

---

## 1. `appointment_reminder` (sent the day before, by the cron job)

**Body**

```
Hi {{1}}, this is a reminder of your {{2}} appointment with Qoui Glam Studio tomorrow at {{3}}, at {{4}}. Prep tip: {{5}} Reply here if you need to change anything.
```

**Sample values for review:** `Jane` · `Glam` · `10:00` · `Qoui Glam Studio, Donholm, Nairobi` ·
`Come with a clean, moisturised face.`

Optional quick-reply buttons: none (keep it simple for v1).

---

## 2. `booking_update` (used when Betty sends OK / NO / REPLY and the client's window has closed)

**Body**

```
Hi {{1}}, an update on your Qoui Glam Studio booking: {{2}}
```

**Sample values:** `Jane` · `You're booked! Glam on Sat 13 Dec 10:00. At the studio in Donholm. Total KES 4,500, deposit KES 1,000 received.`

---

## 3. `betty_alert` (alerts to Betty when she hasn't messaged the bot in 24 hours)

**Body**

```
Qoui Assistant alert: {{1}}
```

**Sample value:** `New booking #12: Jane, Glam, house call (Umoja), Sat 13 Dec 10:00, deposit code TKB4XYZ12A. Reply OK 12 or NO 12.`

> Tip for Betty: send the bot any message (e.g. `TODAY`) once a day. That keeps the 24-hour
> window open, so alerts arrive as normal messages and her OK/NO replies work instantly.

---

### Rules the code already follows

- Template parameters never contain new lines, tabs or more than 4 spaces in a row (Meta rejects those).
- Reply buttons: max 3, max 20 characters each.
- Free-form replies are only sent in reply to a client's message (inside the window).
