CREATE TABLE users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','user')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE integrations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name text NOT NULL, token_ciphertext text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id)
);
CREATE INDEX integrations_owner ON integrations(user_id);
CREATE TABLE selected_products (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 integration_id uuid NOT NULL, dropi_id bigint NOT NULL CHECK(dropi_id > 0),
 original_data jsonb NOT NULL, mapped_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(integration_id,user_id) REFERENCES integrations(id,user_id) ON DELETE CASCADE,
 UNIQUE(integration_id,dropi_id), UNIQUE(id,user_id)
);
CREATE INDEX selected_owner ON selected_products(user_id);
CREATE TABLE template_settings (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 settings jsonb NOT NULL DEFAULT '{"primaryColor":"#193e35","backgroundColor":"#fafbf7","buttonText":"Solicitar información","whatsapp":""}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE landing_pages (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 selected_product_id uuid NOT NULL UNIQUE, slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 product_snapshot jsonb NOT NULL, content jsonb NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(selected_product_id,user_id) REFERENCES selected_products(id,user_id), UNIQUE(id,user_id)
);
CREATE INDEX landings_owner ON landing_pages(user_id);
CREATE INDEX landings_published ON landing_pages(status,updated_at);
CREATE TABLE leads (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), landing_page_id uuid NOT NULL,
 idempotency_key uuid NOT NULL, first_name text NOT NULL, last_name text NOT NULL, email text NOT NULL, phone text NOT NULL,
 product_data jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(landing_page_id,user_id) REFERENCES landing_pages(id,user_id), UNIQUE(landing_page_id,idempotency_key)
);
CREATE INDEX leads_owner ON leads(user_id,created_at DESC);
CREATE TABLE webhook_deliveries (
 id uuid PRIMARY KEY, lead_id uuid NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
 attempts integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','delivered','failed')),
 next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz,
 last_http_status integer, last_error text, history jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deliveries_due ON webhook_deliveries(status,next_attempt_at);
CREATE TABLE rate_limits (
 bucket text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
