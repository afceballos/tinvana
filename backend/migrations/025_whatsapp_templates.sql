-- WhatsApp message templates per connected number: created from Tinvana (sent to Meta for approval) or imported from
-- Meta when syncing. Variables are stored in order with a friendly key and an example; Meta receives positional {{n}}.
CREATE TABLE whatsapp_templates (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, account_id uuid NOT NULL,
 meta_id text, name text NOT NULL, language text NOT NULL, category text NOT NULL, status text NOT NULL DEFAULT 'PENDING',
 body text NOT NULL, footer text, buttons jsonb NOT NULL DEFAULT '[]', variables jsonb NOT NULL DEFAULT '[]',
 purpose text NOT NULL DEFAULT 'custom' CHECK(purpose IN ('custom','order_confirmation','greeting','external')),
 synced_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(account_id,user_id) REFERENCES whatsapp_accounts(id,user_id) ON DELETE CASCADE,
 UNIQUE(account_id,name,language), UNIQUE(id,user_id)
);
CREATE INDEX whatsapp_templates_owner ON whatsapp_templates(user_id,status);
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_templates FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.whatsapp_templates FROM %I',r);
 END LOOP;
END $$;
