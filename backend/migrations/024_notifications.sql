-- Store notifications (panel bell, sound/browser while the panel is open, optional email through the mail:work queue)
-- and their per-store settings. First used by the WhatsApp agent when a chat needs an advisor.
CREATE TABLE notifications (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '', link text, conversation_id uuid,
 read_at timestamptz, email_status text NOT NULL DEFAULT 'skipped' CHECK(email_status IN ('pending','processing','sent','failed','skipped')),
 email_to text, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_feed ON notifications(user_id,created_at DESC);
CREATE INDEX notifications_mail ON notifications(email_status,next_attempt_at);
CREATE TABLE notification_settings (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, settings jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON notifications,notification_settings FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.notifications,public.notification_settings FROM %I',r);
 END LOOP;
END $$;
