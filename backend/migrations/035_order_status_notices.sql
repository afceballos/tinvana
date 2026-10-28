-- Stage 6A: order status notices from the Dropi logistics state, by email (order_mail kinds) and WhatsApp
-- (whatsapp_status_notices queue, one per order and state), their settings, and the customer's voluntary opt-out.
ALTER TABLE order_mail DROP CONSTRAINT IF EXISTS order_mail_kind_check;
ALTER TABLE order_mail ADD CONSTRAINT order_mail_kind_v2 CHECK(kind IN ('buyer_received','owner_new_order','buyer_confirmed','buyer_cancelled','buyer_guide','buyer_in_transit','buyer_novelty','buyer_delivered'));
ALTER TABLE whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_purpose_check;
ALTER TABLE whatsapp_templates ADD CONSTRAINT whatsapp_templates_purpose_v2 CHECK(purpose IN ('custom','order_confirmation','greeting','external','order_status'));
CREATE TABLE IF NOT EXISTS whatsapp_status_notices (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 state text NOT NULL CHECK(state IN ('guide_generated','in_transit','novelty','delivered')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','skipped','failed')),
 details jsonb, channel text, error text, conversation_id uuid, message_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,state)
);
CREATE INDEX IF NOT EXISTS whatsapp_status_notices_queue ON whatsapp_status_notices(status,created_at);
CREATE TABLE IF NOT EXISTS whatsapp_notice_settings (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, settings jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS opted_out_at timestamptz;
ALTER TABLE whatsapp_status_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_notice_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_status_notices,whatsapp_notice_settings FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.whatsapp_status_notices,public.whatsapp_notice_settings FROM %I',r);
 END LOOP;
END $$;
