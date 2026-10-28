-- Chat memory: a short summary the AI keeps up to date, and the pending step of the conversation (for example the
-- order waiting for «1 SÍ / 2 NO»), so the agent knows where the conversation stopped.
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS summary text, ADD COLUMN IF NOT EXISTS pending jsonb;
