-- Own products: created from scratch in Tinbana, without Dropi. They have no integration nor Dropi ID; the store keeps
-- their stock and ships their orders itself (orders.fulfillment='own'). stock_units: units an own order took from stock.
ALTER TABLE selected_products ALTER COLUMN integration_id DROP NOT NULL, ALTER COLUMN dropi_id DROP NOT NULL,
 ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'dropi',
 ADD CONSTRAINT selected_products_source_ck CHECK((source='dropi' AND integration_id IS NOT NULL AND dropi_id IS NOT NULL) OR (source='own' AND integration_id IS NULL AND dropi_id IS NULL));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment text NOT NULL DEFAULT 'dropi',
 ADD COLUMN IF NOT EXISTS stock_units integer,
 ADD CONSTRAINT orders_fulfillment_ck CHECK(fulfillment IN ('dropi','own')),
 ADD CONSTRAINT orders_stock_units_ck CHECK(stock_units IS NULL OR stock_units>0);
