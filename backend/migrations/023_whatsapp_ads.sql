-- WhatsApp sales module, stage 4: offers (product + units + price rule + code), Click to WhatsApp ads mapped to an
-- offer, every entry of a contact recorded separately, and the offer/identification of each conversation.
CREATE TABLE whatsapp_offers (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, selected_product_id uuid NOT NULL,
 code text NOT NULL, name text NOT NULL, units integer NOT NULL CHECK(units BETWEEN 1 AND 99),
 price_mode text NOT NULL CHECK(price_mode IN ('tiers','fixed')), fixed_price numeric(14,2) CHECK(fixed_price >= 0),
 landing_default integer NOT NULL DEFAULT 0 CHECK(landing_default IN (0,1)), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(selected_product_id,user_id) REFERENCES selected_products(id,user_id) ON DELETE CASCADE,
 UNIQUE(user_id,code), UNIQUE(id,user_id)
);
CREATE TABLE whatsapp_ads (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, ad_id text NOT NULL, name text NOT NULL,
 offer_id uuid, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused')),
 origin text NOT NULL CHECK(origin IN ('first_message','manual')), source jsonb NOT NULL DEFAULT '{}',
 first_seen_at timestamptz, last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,ad_id), UNIQUE(id,user_id)
);
CREATE TABLE whatsapp_entries (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, conversation_id uuid NOT NULL,
 ad_ref uuid, offer_id uuid, method text NOT NULL CHECK(method IN ('ad','code_link','code_text')),
 certainty text NOT NULL CHECK(certainty IN ('alta','media','baja')), code text, referral jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(conversation_id,user_id) REFERENCES whatsapp_conversations(id,user_id) ON DELETE CASCADE
);
CREATE INDEX whatsapp_entries_ad ON whatsapp_entries(user_id,ad_ref,created_at);
ALTER TABLE whatsapp_conversations ADD COLUMN ad_ref uuid, ADD COLUMN offer_method text, ADD COLUMN offer_certainty text, ADD COLUMN offer_changed integer NOT NULL DEFAULT 0 CHECK(offer_changed IN (0,1));
ALTER TABLE whatsapp_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_offers,whatsapp_ads,whatsapp_entries FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.whatsapp_offers,public.whatsapp_ads,public.whatsapp_entries FROM %I',r);
 END LOOP;
END $$;
