-- Closed conversations: closed by the customer («no tengo más dudas») or after 24 hours without messages. The next
-- message opens it again and the AI only reads from opened_at. Messages of chats closed 30 days ago are deleted (purged_at).
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS closed_at timestamptz, ADD COLUMN IF NOT EXISTS closed_reason text,
 ADD COLUMN IF NOT EXISTS opened_at timestamptz, ADD COLUMN IF NOT EXISTS purged_at timestamptz;
CREATE INDEX IF NOT EXISTS whatsapp_conversations_closed ON whatsapp_conversations(closed_at);
