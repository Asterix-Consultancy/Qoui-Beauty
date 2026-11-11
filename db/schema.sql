-- Qoui Glam Studio - PostgreSQL schema (v1)
-- Timezone: all timestamps are timestamptz; the app converts to Africa/Nairobi.
-- Run once: psql "$DATABASE_URL" -f db/schema.sql && psql "$DATABASE_URL" -f db/seed.sql

BEGIN;

CREATE TABLE IF NOT EXISTS clients (
  id          serial PRIMARY KEY,
  phone       text NOT NULL UNIQUE,             -- WhatsApp id, digits only, e.g. 254727509719
  name        text,                             -- name given when booking
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
  id            serial PRIMARY KEY,
  code          text NOT NULL UNIQUE CHECK (code ~ '^[a-z_]+$'),   -- soft_glam | glam | bridal
  name          text NOT NULL,
  price_kes     int  NOT NULL CHECK (price_kes >= 0),
  duration_min  int  NOT NULL CHECK (duration_min > 0),
  description   text NOT NULL DEFAULT '',        -- what the look includes (assistant reads this)
  prep_tip      text NOT NULL DEFAULT '',        -- used in the day-before reminder
  active        boolean NOT NULL DEFAULT true
);

-- Key/value settings: house_call_fee, travel_buffer_min, deposit_amount, slot_step_min,
-- min_lead_min, max_days_ahead, pending_hold_hours, studio_address
CREATE TABLE IF NOT EXISTS settings (
  key    text PRIMARY KEY,
  value  text NOT NULL
);

-- Weekly opening hours. weekday: 0 = Monday ... 6 = Sunday (Python's date.weekday()).
CREATE TABLE IF NOT EXISTS availability (
  id          serial PRIMARY KEY,
  weekday     int  NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS blocked_days (
  id      serial PRIMARY KEY,
  day     date NOT NULL UNIQUE,
  reason  text
);

CREATE TABLE IF NOT EXISTS bookings (
  id                serial PRIMARY KEY,
  client_id         int  NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_id        int  NOT NULL REFERENCES services(id),
  location_type     text NOT NULL CHECK (location_type IN ('studio', 'house_call')),
  address           text,
  start_at          timestamptz NOT NULL,       -- when the makeup starts
  end_at            timestamptz NOT NULL,       -- when the makeup ends
  -- Betty's busy window: same as start/end for studio; widened by the travel buffer
  -- on both sides for house calls. Double-booking is checked on THIS range.
  busy_from         timestamptz NOT NULL,
  busy_to           timestamptz NOT NULL,
  total_kes         int  NOT NULL CHECK (total_kes >= 0),
  deposit_kes       int  NOT NULL CHECK (deposit_kes >= 0),
  mpesa_code        text CHECK (mpesa_code IS NULL OR mpesa_code ~ '^[A-Z0-9]{10}$'),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'deposit_claimed', 'confirmed', 'cancelled', 'completed', 'no_show')),
  reminder_sent_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  CHECK (busy_from <= start_at AND busy_to >= end_at),
  CHECK (location_type = 'studio' OR (address IS NOT NULL AND length(trim(address)) > 0)),
  -- Hard guarantee against double-booking, even under concurrent requests.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (tstzrange(busy_from, busy_to, '[)') WITH &&)
    WHERE (status IN ('pending', 'deposit_claimed', 'confirmed'))
);

-- An M-Pesa code can only ever pay for one booking.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_mpesa_code_uniq ON bookings (mpesa_code) WHERE mpesa_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookings_start_idx ON bookings (start_at);
CREATE INDEX IF NOT EXISTS bookings_client_idx ON bookings (client_id);

CREATE TABLE IF NOT EXISTS messages (
  id             serial PRIMARY KEY,
  wa_message_id  text UNIQUE,                    -- Meta's id; UNIQUE = retries are never processed twice
  client_id      int REFERENCES clients(id) ON DELETE CASCADE,   -- NULL for messages with Betty
  direction      text NOT NULL CHECK (direction IN ('in', 'out')),
  type           text NOT NULL,
  body           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_client_idx ON messages (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS handoffs (
  id          serial PRIMARY KEY,
  client_id   int NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  resolved    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- v1.1: website booking flow (safe to re-run on an existing database)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'whatsapp';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_ip_hash text;   -- salted hash, for rate limiting only
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS web_token_hash text;   -- hash of the secret the browser holds to add a deposit code
DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT bookings_source_chk CHECK (source IN ('whatsapp', 'web'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS bookings_ip_recent_idx ON bookings (client_ip_hash, created_at) WHERE client_ip_hash IS NOT NULL;

-- v1.2: admin UI
CREATE TABLE IF NOT EXISTS testimonials (
  id          serial PRIMARY KEY,
  quote       text NOT NULL CHECK (length(quote) BETWEEN 3 AND 600),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  service     text NOT NULL DEFAULT '',
  visible     boolean NOT NULL DEFAULT true,
  sort        int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id          serial PRIMARY KEY,
  ip_hash     text NOT NULL,
  ok          boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_login_recent_idx ON admin_login_attempts (ip_hash, created_at);

-- v1.4: admin users with password + authenticator-app OTP
CREATE TABLE IF NOT EXISTS admin_users (
  id                   serial PRIMARY KEY,
  email                text NOT NULL UNIQUE CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name                 text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  role                 text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff')),
  password_hash        text,                         -- scrypt; NULL until the invite is accepted
  password_changed_at  timestamptz,
  totp_secret_enc      text,                         -- encrypted with APP_ENCRYPTION_KEY
  totp_enabled         boolean NOT NULL DEFAULT false,
  totp_last_step       bigint NOT NULL DEFAULT 0,    -- blocks re-use of an OTP code
  failed_count         int NOT NULL DEFAULT 0,
  locked_until         timestamptz,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_login_at        timestamptz
);
CREATE TABLE IF NOT EXISTS admin_password_history (
  id          serial PRIMARY KEY,
  user_id     int NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  hash        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_recovery_codes (
  id          serial PRIMARY KEY,
  user_id     int NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  code_hash   text NOT NULL,
  used_at     timestamptz
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  id            serial PRIMARY KEY,
  token_hash    text NOT NULL UNIQUE,                -- only the SHA-256 of the cookie value is stored
  user_id       int NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  ip_hash       text,
  user_agent    text,
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS admin_sessions_user_idx ON admin_sessions (user_id) WHERE revoked_at IS NULL;
-- Short-lived one-time tokens: login OTP step, invite link, authenticator enrolment.
CREATE TABLE IF NOT EXISTS admin_challenges (
  id          serial PRIMARY KEY,
  token_hash  text NOT NULL UNIQUE,
  user_id     int NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('otp', 'invite', 'enroll')),
  expires_at  timestamptz NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_audit (
  id          serial PRIMARY KEY,
  user_id     int REFERENCES admin_users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  detail      text,
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit (created_at DESC);

COMMIT;
