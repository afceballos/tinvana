-- Tinvana fresh MySQL schema (MySQL 8.0.16+ / InnoDB / utf8mb4).
-- Select the empty database created in cPanel before importing this file.
-- Secrets and account rows are intentionally not seeded here.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';

CREATE TABLE schema_migrations (
  version VARCHAR(100) NOT NULL,
  checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'user',
  profile JSON NOT NULL DEFAULT (JSON_OBJECT()),
  avatar_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  session_version INT NOT NULL DEFAULT 0,
  email_verified_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY users_email_uq (email),
  CONSTRAINT users_role_ck CHECK (role IN ('admin','user'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE integrations (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(200) NOT NULL,
  token_ciphertext TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY integrations_id_owner_uq (id,user_id),
  KEY integrations_owner_idx (user_id),
  CONSTRAINT integrations_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE selected_products (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  integration_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  dropi_id BIGINT NOT NULL,
  original_data JSON NOT NULL,
  mapped_data JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY selected_integration_dropi_uq (integration_id,dropi_id),
  UNIQUE KEY selected_id_owner_uq (id,user_id),
  KEY selected_owner_idx (user_id),
  CONSTRAINT selected_dropi_id_ck CHECK (dropi_id > 0),
  CONSTRAINT selected_integration_owner_fk FOREIGN KEY (integration_id,user_id) REFERENCES integrations(id,user_id) ON DELETE CASCADE,
  CONSTRAINT selected_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE template_settings (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  settings JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  CONSTRAINT template_settings_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE landing_pages (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  selected_product_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  slug VARCHAR(180) NOT NULL,
  product_snapshot JSON NOT NULL,
  published_product_snapshot JSON NULL,
  content JSON NOT NULL,
  published_content JSON NULL,
  published_slug VARCHAR(180) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  published_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY landing_selected_product_uq (selected_product_id),
  UNIQUE KEY landing_slug_uq (slug),
  UNIQUE KEY landing_published_slug_uq (published_slug),
  UNIQUE KEY landing_id_owner_uq (id,user_id),
  KEY landings_owner_idx (user_id),
  KEY landings_published_idx (status,updated_at),
  CONSTRAINT landing_status_ck CHECK (status IN ('draft','published')),
  CONSTRAINT landing_slug_ck CHECK (slug REGEXP '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT landing_product_owner_fk FOREIGN KEY (selected_product_id,user_id) REFERENCES selected_products(id,user_id),
  CONSTRAINT landing_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE leads (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  landing_page_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  idempotency_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  first_name VARCHAR(200) NOT NULL,
  last_name VARCHAR(200) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  phone_country CHAR(2) NULL,
  delivery_address JSON NULL,
  product_data JSON NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY leads_landing_idempotency_uq (landing_page_id,idempotency_key),
  UNIQUE KEY leads_id_owner_uq (id,user_id),
  KEY leads_owner_created_idx (user_id,created_at),
  CONSTRAINT leads_status_ck CHECK (status IN ('pending','delivered','failed')),
  CONSTRAINT leads_phone_country_ck CHECK (phone_country IS NULL OR phone_country REGEXP '^[A-Z]{2}$'),
  CONSTRAINT leads_landing_owner_fk FOREIGN KEY (landing_page_id,user_id) REFERENCES landing_pages(id,user_id),
  CONSTRAINT leads_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE webhook_settings (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provider VARCHAR(16) NOT NULL,
  url_ciphertext TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  CONSTRAINT webhook_provider_ck CHECK (provider IN ('ghl','generic')),
  CONSTRAINT webhook_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE webhook_deliveries (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  lead_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  next_attempt_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  locked_at DATETIME(6) NULL,
  last_http_status INT NULL,
  last_error TEXT NULL,
  history JSON NOT NULL DEFAULT (JSON_ARRAY()),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY delivery_lead_uq (lead_id),
  KEY deliveries_due_idx (status,next_attempt_at),
  CONSTRAINT delivery_status_ck CHECK (status IN ('pending','processing','delivered','failed')),
  CONSTRAINT delivery_lead_fk FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rate_limits (
  bucket CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (bucket)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE media_assets (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  landing_page_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  bytes INT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  original_name VARCHAR(200) NOT NULL DEFAULT '',
  storage_path TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY media_assets_owner_idx (user_id,landing_page_id),
  KEY media_assets_library_idx (user_id,created_at,id),
  CONSTRAINT media_bytes_ck CHECK (bytes > 0 AND bytes <= 409600),
  CONSTRAINT media_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT media_landing_fk FOREIGN KEY (landing_page_id) REFERENCES landing_pages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ai_connections (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provider VARCHAR(16) NOT NULL,
  key_ciphertext TEXT NOT NULL,
  verified_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id,provider),
  CONSTRAINT ai_provider_ck CHECK (provider IN ('openai','anthropic')),
  CONSTRAINT ai_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE account_tokens (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  purpose VARCHAR(16) NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  used_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY account_token_hash_uq (token_hash),
  KEY account_tokens_owner_idx (user_id,purpose),
  CONSTRAINT account_token_purpose_ck CHECK (purpose IN ('verify','reset')),
  CONSTRAINT account_token_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE account_mail (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_ciphertext TEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  locked_at DATETIME(6) NULL,
  last_error TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY account_mail_queue_idx (status,next_attempt_at),
  CONSTRAINT account_mail_status_ck CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  CONSTRAINT account_mail_token_fk FOREIGN KEY (token_id) REFERENCES account_tokens(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  lead_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'landing',
  customer JSON NOT NULL,
  delivery_address JSON NOT NULL,
  product_data JSON NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(14,2) NULL,
  shipping_price DECIMAL(14,2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'COP',
  sale_status VARCHAR(16) NOT NULL DEFAULT 'draft',
  integration_status VARCHAR(16) NOT NULL DEFAULT 'not_sent',
  logistics_status VARCHAR(16) NOT NULL DEFAULT 'not_requested',
  payment_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  version INT NOT NULL DEFAULT 1,
  quote_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  quote_expires_at DATETIME(6) NULL,
  confirmation JSON NULL,
  variant_data JSON NULL,
  offer_snapshot JSON NULL,
  notes TEXT NOT NULL DEFAULT (''),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY orders_lead_uq (lead_id),
  UNIQUE KEY orders_id_owner_uq (id,user_id),
  KEY orders_owner_created_idx (user_id,created_at,id),
  KEY orders_owner_status_idx (user_id,sale_status,created_at),
  CONSTRAINT orders_source_ck CHECK (source='landing'),
  CONSTRAINT orders_quantity_ck CHECK (quantity BETWEEN 1 AND 100),
  CONSTRAINT orders_unit_price_ck CHECK (unit_price IS NULL OR unit_price >= 0),
  CONSTRAINT orders_shipping_price_ck CHECK (shipping_price IS NULL OR shipping_price >= 0),
  CONSTRAINT orders_currency_ck CHECK (currency='COP'),
  CONSTRAINT orders_sale_status_ck CHECK (sale_status IN ('draft','confirmed','cancelled')),
  CONSTRAINT orders_integration_status_ck CHECK (integration_status='not_sent'),
  CONSTRAINT orders_logistics_status_ck CHECK (logistics_status='not_requested'),
  CONSTRAINT orders_payment_status_ck CHECK (payment_status='pending'),
  CONSTRAINT orders_version_ck CHECK (version > 0),
  CONSTRAINT orders_lead_owner_fk FOREIGN KEY (lead_id,user_id) REFERENCES leads(id,user_id) ON DELETE CASCADE,
  CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_events (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  event_type VARCHAR(100) NOT NULL,
  order_version INT NOT NULL,
  data JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY order_events_order_idx (order_id,created_at,id),
  CONSTRAINT order_events_order_owner_fk FOREIGN KEY (order_id,user_id) REFERENCES orders(id,user_id) ON DELETE CASCADE,
  CONSTRAINT order_events_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_offers (
  selected_product_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version INT NOT NULL,
  settings JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (selected_product_id),
  UNIQUE KEY product_offers_product_user_uq (selected_product_id,user_id),
  KEY product_offers_owner_idx (user_id),
  CONSTRAINT product_offers_version_ck CHECK (version > 0),
  CONSTRAINT product_offers_product_owner_fk FOREIGN KEY (selected_product_id,user_id) REFERENCES selected_products(id,user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_offer_versions (
  selected_product_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version INT NOT NULL,
  settings JSON NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (selected_product_id,version),
  CONSTRAINT product_offer_versions_version_ck CHECK (version > 0),
  CONSTRAINT product_offer_versions_owner_fk FOREIGN KEY (selected_product_id,user_id) REFERENCES product_offers(selected_product_id,user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
