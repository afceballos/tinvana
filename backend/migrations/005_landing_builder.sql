-- Additive snapshot migration. Existing published pages retain all content.
ALTER TABLE landing_pages ADD COLUMN published_content jsonb;
ALTER TABLE landing_pages ADD COLUMN published_product_snapshot jsonb;
ALTER TABLE landing_pages ADD COLUMN published_slug text;
UPDATE landing_pages SET published_content=content,published_product_snapshot=product_snapshot,published_slug=slug WHERE status='published';
CREATE UNIQUE INDEX landing_published_slug ON landing_pages(published_slug) WHERE published_slug IS NOT NULL;
