-- Dropi order submission: attempt state, external order id and the last upstream result.
ALTER TABLE orders DROP CONSTRAINT orders_integration_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_integration_status_v2 CHECK(integration_status IN ('not_sent','sending','sent','failed','unknown'));
ALTER TABLE orders ADD COLUMN dropi_order_id text;
ALTER TABLE orders ADD COLUMN integration_data jsonb;
