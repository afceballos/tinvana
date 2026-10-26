-- WhatsApp: a store may connect a number that lives in its own Meta app. Its app secret (to validate webhook signatures)
-- and a per-account webhook verify token are stored encrypted; the token hash allows the GET verification lookup.
ALTER TABLE whatsapp_accounts ADD COLUMN app_secret_ciphertext text, ADD COLUMN verify_token_hash text UNIQUE, ADD COLUMN verify_token_ciphertext text;
