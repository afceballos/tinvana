-- Stage 6B: one reminder per unconfirmed order and per purchase left halfway in the chat (ref is the dedupe key).
CREATE TABLE IF NOT EXISTS whatsapp_reminders (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('unconfirmed','abandoned')), ref text NOT NULL,
 order_id uuid REFERENCES orders(id) ON DELETE CASCADE, conversation_id uuid,
 status text NOT NULL CHECK(status IN ('sent','skipped','failed','answered','no_answer')), channel text, error text,
 created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
 UNIQUE(user_id,ref)
);
CREATE INDEX IF NOT EXISTS whatsapp_reminders_open ON whatsapp_reminders(status,created_at);
ALTER TABLE whatsapp_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_reminders FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.whatsapp_reminders FROM %I',r);
 END LOOP;
END $$;
