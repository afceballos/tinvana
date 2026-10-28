-- Order confirmation, customer writes first: the success popup opens WhatsApp with a short code; when the customer
-- sends it the summary goes out as an interactive message (no template). send_after is when the template fallback is due.
ALTER TABLE whatsapp_order_confirmations ADD COLUMN IF NOT EXISTS code text, ADD COLUMN IF NOT EXISTS channel text, ADD COLUMN IF NOT EXISTS send_after timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_order_confirmations_code ON whatsapp_order_confirmations(user_id,code);
