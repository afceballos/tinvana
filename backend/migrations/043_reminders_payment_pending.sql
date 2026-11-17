-- Wompi phase 3: one WhatsApp reminder with the payment link for an online order still unpaid after 24 hours.
ALTER TABLE whatsapp_reminders DROP CONSTRAINT IF EXISTS whatsapp_reminders_kind_check;
ALTER TABLE whatsapp_reminders ADD CONSTRAINT whatsapp_reminders_kind_ck CHECK(kind IN ('unconfirmed','abandoned','payment_pending'));
