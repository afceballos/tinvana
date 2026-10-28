-- Stage 6C: items of «Pendientes» marked as reviewed by the store (only the ones that do not resolve by themselves).
-- The key carries the occurrence (message, reminder, status), so a new problem shows up again.
CREATE TABLE IF NOT EXISTS pending_reviewed (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, item_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,item_key)
);
ALTER TABLE pending_reviewed ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pending_reviewed FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.pending_reviewed FROM %I',r);
 END LOOP;
END $$;
