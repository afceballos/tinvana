ALTER TABLE leads ADD COLUMN delivery_address jsonb CHECK(delivery_address IS NULL OR jsonb_typeof(delivery_address)='object');
ALTER TABLE leads ADD COLUMN phone_country text CHECK(phone_country IS NULL OR phone_country ~ '^[A-Z]{2}$');
-- Existing leads retain their original contact data. New submissions require an address.
