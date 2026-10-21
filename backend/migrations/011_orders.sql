-- Local orders only: no external Dropi operation is enabled by this migration.
ALTER TABLE leads ADD CONSTRAINT leads_id_owner UNIQUE(id,user_id);
CREATE TABLE orders (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL UNIQUE, source text NOT NULL DEFAULT 'landing' CHECK(source='landing'),
 customer jsonb NOT NULL, delivery_address jsonb NOT NULL, product_data jsonb NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 unit_price numeric(14,2) CHECK(unit_price >= 0), shipping_price numeric(14,2) CHECK(shipping_price >= 0),
 currency text NOT NULL DEFAULT 'COP' CHECK(currency='COP'),
 sale_status text NOT NULL DEFAULT 'draft' CHECK(sale_status IN ('draft','confirmed','cancelled')),
 integration_status text NOT NULL DEFAULT 'not_sent' CHECK(integration_status='not_sent'),
 logistics_status text NOT NULL DEFAULT 'not_requested' CHECK(logistics_status='not_requested'),
 payment_status text NOT NULL DEFAULT 'pending' CHECK(payment_status='pending'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), quote_id uuid, quote_expires_at timestamptz,
 confirmation jsonb, notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(lead_id,user_id) REFERENCES leads(id,user_id) ON DELETE CASCADE,
 UNIQUE(id,user_id)
);
CREATE INDEX orders_owner_created ON orders(user_id,created_at DESC,id);
CREATE INDEX orders_owner_status ON orders(user_id,sale_status,created_at DESC);
CREATE TABLE order_events (
 id uuid PRIMARY KEY, order_id uuid NOT NULL, user_id uuid NOT NULL,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 event_type text NOT NULL, order_version integer NOT NULL, data jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(order_id,user_id) REFERENCES orders(id,user_id) ON DELETE CASCADE
);
CREATE INDEX order_events_order ON order_events(order_id,created_at,id);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON orders,order_events FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.orders,public.order_events FROM %I',r);
 END LOOP;
END $$;
