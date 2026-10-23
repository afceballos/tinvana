-- Order emails (buyer received/confirmed/cancelled, owner new order) and per-user mail settings.
CREATE TABLE order_mail (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('buyer_received','owner_new_order','buyer_confirmed','buyer_cancelled')),
 dedupe_key text NOT NULL UNIQUE, payload_ciphertext text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz,
 last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_mail_queue ON order_mail(status,next_attempt_at);
ALTER TABLE users ADD COLUMN mail_settings jsonb;
ALTER TABLE order_mail ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON order_mail FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.order_mail FROM %I',r);
 END LOOP;
END $$;
