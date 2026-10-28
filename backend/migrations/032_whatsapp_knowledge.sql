-- Approved learnings of the WhatsApp agent: question and answer pairs of a store (user_id) or of the whole platform
-- (user_id NULL, managed by a superadmin). The agent receives the ones related to what the customer asks.
CREATE TABLE IF NOT EXISTS whatsapp_knowledge (
 id uuid PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE CASCADE, question text NOT NULL, answer text NOT NULL,
 source_conversation_id uuid, created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_knowledge_owner ON whatsapp_knowledge(user_id,updated_at);
ALTER TABLE whatsapp_knowledge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_knowledge FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.whatsapp_knowledge FROM %I',r);
 END LOOP;
END $$;
