ALTER TABLE whatsapp_reminders ADD CONSTRAINT whatsapp_reminders_kind_ck CHECK (kind IN ('unconfirmed','abandoned','payment_pending'))
