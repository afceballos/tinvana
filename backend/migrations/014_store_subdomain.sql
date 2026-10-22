ALTER TABLE users ADD COLUMN store_subdomain text;
ALTER TABLE users ADD CONSTRAINT users_store_subdomain_format CHECK (store_subdomain IS NULL OR store_subdomain ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
CREATE UNIQUE INDEX users_store_subdomain_unique ON users(store_subdomain) WHERE store_subdomain IS NOT NULL;
