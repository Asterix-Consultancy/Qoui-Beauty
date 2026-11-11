-- Qoui Glam Studio - starting data. Safe to re-run: it only fills in what's missing and never
-- overwrites what Betty has changed in Admin → Settings.

BEGIN;

INSERT INTO services (code, name, price_kes, duration_min, description, prep_tip) VALUES
  ('soft_glam', 'Soft glam', 3000, 60,   -- minutes; Betty edits in Admin
   'Light, skin-like base, soft eye definition, groomed brows, natural lashes on request, nude or soft lip.',
   'Come with a clean, moisturised face and no makeup on.'),
  ('glam', 'Glam', 4500, 90,              -- minutes; Betty edits in Admin
   'Full-coverage long-wear base, contour and highlight, defined or smoky eye, strip lashes, bold or glossy lip.',
   'Come with a clean, moisturised face. Bring your outfit colours or a photo so we can match the look.'),
  ('bridal', 'Bridal', 6000, 120,         -- minutes; Betty edits in Admin
   'Long-wear, photo-ready, tear-resistant bridal makeup with lashes and touch-up advice for the day.',
   'Sleep well, drink water, and come with a clean, moisturised face. Avoid new skincare this week.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('house_call_fee',     '1500'),
  ('travel_buffer_min',  '60'),     -- minutes blocked before AND after a house call
  ('deposit_amount',     '1000'),   -- KES to hold a slot
  ('slot_step_min',      '30'),     -- start times offered every 30 min
  ('min_lead_min',       '120'),    -- no bookings starting sooner than 2 h from now
  ('max_days_ahead',     '120'),    -- how far ahead clients can book
  ('pending_hold_hours', '12'),     -- unpaid PENDING bookings stop holding the slot after this
  ('studio_address',     'Qoui Glam Studio, Donholm, Nairobi')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('studio_directions', ''),
  ('mpesa_number', ''),
  ('mpesa_name', ''),
  ('whatsapp_number', '254727509719'),     -- the studio's public WhatsApp (site buttons)
  ('alert_whatsapp', ''),                  -- where booking alerts go once the WhatsApp side is on
  ('password_max_age_days', '90'),         -- admin users must change passwords this often
  ('session_idle_min', '60'),              -- admin signs out after this long without activity
  ('session_max_hours', '12')              -- and after this long regardless
ON CONFLICT (key) DO NOTHING;

-- Starting opening hours (only if none exist yet). weekday: 0 = Monday ... 6 = Sunday.
INSERT INTO availability (weekday, start_time, end_time)
SELECT * FROM (VALUES
  (0, '09:00'::time, '18:00'::time),
  (1, '09:00', '18:00'),
  (2, '09:00', '18:00'),
  (3, '09:00', '18:00'),
  (4, '09:00', '18:00'),
  (5, '06:00', '18:00'),   -- Saturday: early start for brides
  (6, '06:00'::time, '14:00'::time)    -- Sunday
) AS v(weekday, start_time, end_time)
WHERE NOT EXISTS (SELECT 1 FROM availability);

COMMIT;
