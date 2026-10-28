-- Order confirmation of landing orders by WhatsApp: per-store settings and one confirmation per order. The template
-- is sent with one quick reply payload per button; the customer's tap (wamid and context) is the evidence.
CREATE TABLE whatsapp_confirm_settings (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 settings jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE whatsapp_order_confirmations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, order_id uuid NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','skipped','confirmed','change','stale')),
 origin text NOT NULL DEFAULT 'landing' CHECK(origin IN ('landing','manual')),
 conversation_id uuid, message_id uuid, quote_id uuid, order_version integer, error text,
 reply text CHECK(reply IN ('confirm','change')), reply_message_id uuid, reply_wamid text, reply_pending boolean NOT NULL DEFAULT false,
 locked_at timestamptz, sent_at timestamptz, replied_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(order_id,user_id) REFERENCES orders(id,user_id) ON DELETE CASCADE, UNIQUE(id,user_id)
);
CREATE INDEX whatsapp_order_confirmations_due ON whatsapp_order_confirmations(status,reply_pending);
CREATE INDEX whatsapp_order_confirmations_owner ON whatsapp_order_confirmations(user_id,created_at);
CREATE INDEX whatsapp_order_confirmations_chat ON whatsapp_order_confirmations(conversation_id,status);
ALTER TABLE whatsapp_confirm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_order_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_confirm_settings,whatsapp_order_confirmations FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.whatsapp_confirm_settings, public.whatsapp_order_confirmations FROM %I',r);
 END LOOP;
END $$;
