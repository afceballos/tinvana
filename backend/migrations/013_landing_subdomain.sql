ALTER TABLE landing_pages ADD COLUMN subdomain text, ADD COLUMN published_subdomain text;
ALTER TABLE landing_pages ADD CONSTRAINT landing_subdomain_format CHECK (subdomain IS NULL OR subdomain ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'), ADD CONSTRAINT landing_published_subdomain_format CHECK (published_subdomain IS NULL OR published_subdomain ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
CREATE UNIQUE INDEX landing_subdomain_unique ON landing_pages(subdomain) WHERE subdomain IS NOT NULL;
CREATE UNIQUE INDEX landing_published_subdomain_unique ON landing_pages(published_subdomain) WHERE published_subdomain IS NOT NULL;
