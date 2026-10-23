-- Logistics state mirrored from Dropi tracking (read-only sync).
ALTER TABLE orders DROP CONSTRAINT orders_logistics_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_logistics_status_v2 CHECK(logistics_status IN ('not_requested','pending','guide_generated','in_transit','novelty','delivered','returned','cancelled'));
