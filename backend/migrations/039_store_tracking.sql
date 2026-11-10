-- Store-wide measurement IDs (Meta pixel, Google Analytics 4, Google Ads, Google Tag Manager and domain verification).
-- Only IDs with a fixed format are kept; the landing loads the official scripts itself, never pasted code.
CREATE TABLE IF NOT EXISTS store_tracking (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, settings jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE store_tracking ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON store_tracking FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.store_tracking FROM %I',r);
 END LOOP;
END $$;
