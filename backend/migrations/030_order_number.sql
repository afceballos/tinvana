-- Public order number (TV-XXXX-XXXX): unique, random and shown to the buyer to confirm and look up the order.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number ON orders(order_number);
