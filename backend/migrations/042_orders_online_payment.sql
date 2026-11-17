-- Wompi payments, phase 2: an order can be paid online. payment_status was fixed to 'pending' and unused until now;
-- it now also takes 'paid' and 'expired' (48 h without an approved payment). Cash on delivery stays 'cod'/'pending'.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cod',
 ADD COLUMN IF NOT EXISTS payment_reference text, ADD COLUMN IF NOT EXISTS payment jsonb,
 ADD COLUMN IF NOT EXISTS payment_due_at timestamptz, ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_ck CHECK(payment_status IN ('pending','paid','expired'));
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_ck CHECK(payment_method IN ('cod','online'));
CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_reference ON orders(user_id,payment_reference) WHERE payment_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_payment_due ON orders(payment_status,payment_due_at) WHERE payment_method='online';