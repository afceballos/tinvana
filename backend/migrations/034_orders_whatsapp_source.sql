-- Orders made in the WhatsApp chat (stage 5) keep source='whatsapp'; they still come with their lead and landing.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_source_v2 CHECK(source IN ('landing','whatsapp'));
