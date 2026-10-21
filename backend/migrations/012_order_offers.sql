ALTER TABLE orders ADD COLUMN variant_data jsonb;
ALTER TABLE orders ADD COLUMN offer_snapshot jsonb;
CREATE TABLE product_offers (
 selected_product_id uuid PRIMARY KEY, user_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), settings jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(selected_product_id,user_id) REFERENCES selected_products(id,user_id) ON DELETE CASCADE,
 UNIQUE(selected_product_id,user_id)
);
CREATE TABLE product_offer_versions (
 selected_product_id uuid NOT NULL, user_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 settings jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(selected_product_id,version),
 FOREIGN KEY(selected_product_id,user_id) REFERENCES product_offers(selected_product_id,user_id) ON DELETE CASCADE
);
CREATE INDEX product_offers_owner ON product_offers(user_id);
ALTER TABLE product_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_offer_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON product_offers,product_offer_versions FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.product_offers,public.product_offer_versions FROM %I',r);
 END LOOP;
END $$;
