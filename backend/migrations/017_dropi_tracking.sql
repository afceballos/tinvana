-- Dropi order tracking (read-only GET orders/myorders/{id}): last status, guide/carrier/history snapshot and last sync time.
ALTER TABLE orders ADD COLUMN dropi_status text;
ALTER TABLE orders ADD COLUMN dropi_tracking jsonb;
ALTER TABLE orders ADD COLUMN dropi_synced_at timestamptz;
CREATE INDEX orders_dropi_sync ON orders(integration_status,dropi_synced_at);
