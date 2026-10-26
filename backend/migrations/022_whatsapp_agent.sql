-- WhatsApp sales module, stage 3: AI agent settings per store, approved product sheets (versioned) and the
-- conversation fields the agent needs (product being discussed, sheet version, and counters so it answers the
-- latest customer messages exactly once even when several arrive while it is thinking).
CREATE TABLE whatsapp_agent_settings (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 settings jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE whatsapp_product_sheets (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, selected_product_id uuid NOT NULL,
 version integer NOT NULL, status text NOT NULL CHECK(status IN ('draft','approved')), content jsonb NOT NULL,
 approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(selected_product_id,user_id) REFERENCES selected_products(id,user_id) ON DELETE CASCADE,
 UNIQUE(selected_product_id,version), UNIQUE(id,user_id)
);
CREATE INDEX whatsapp_product_sheets_owner ON whatsapp_product_sheets(user_id,selected_product_id,status);
ALTER TABLE whatsapp_conversations ADD COLUMN product_id uuid, ADD COLUMN sheet_version integer,
 ADD COLUMN customer_seq integer NOT NULL DEFAULT 0, ADD COLUMN ai_seq integer NOT NULL DEFAULT 0;
ALTER TABLE whatsapp_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_product_sheets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_agent_settings,whatsapp_product_sheets FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.whatsapp_agent_settings,public.whatsapp_product_sheets FROM %I',r);
 END LOOP;
END $$;
