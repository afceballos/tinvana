-- Wompi payments, phase 1: each store connects its own Wompi account (four keys, the three secret ones encrypted)
-- and gets its own events URL (/wompi/events/<token>). Signed events are stored once per transaction and status.
CREATE TABLE IF NOT EXISTS wompi_accounts (
 id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 environment text NOT NULL CHECK(environment IN ('test','prod')), public_key text NOT NULL,
 private_key_ciphertext text NOT NULL, events_secret_ciphertext text NOT NULL, integrity_secret_ciphertext text NOT NULL,
 events_token_hash text NOT NULL UNIQUE, events_token_ciphertext text NOT NULL,
 merchant_name text, payment_methods text, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','connected','error')),
 last_error text, last_tested_at timestamptz, last_event_at timestamptz, last_rejected_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wompi_events (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_type text NOT NULL, environment text NOT NULL, transaction_id text, reference text, status text,
 amount_in_cents bigint, payment_method text, payload jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 UNIQUE(user_id,transaction_id,status)
);
CREATE INDEX IF NOT EXISTS wompi_events_reference ON wompi_events(user_id,reference);
CREATE INDEX IF NOT EXISTS wompi_events_recent ON wompi_events(user_id,received_at DESC);
ALTER TABLE wompi_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wompi_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wompi_accounts,wompi_events FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.wompi_accounts,public.wompi_events FROM %I',r);
 END LOOP;
END $$;
