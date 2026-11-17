-- Wompi phase 4: send paid orders to Dropi (SIN RECAUDO) automatically. Off by default: the store sends each one.
ALTER TABLE wompi_accounts ADD COLUMN IF NOT EXISTS auto_dropi smallint NOT NULL DEFAULT 0;
