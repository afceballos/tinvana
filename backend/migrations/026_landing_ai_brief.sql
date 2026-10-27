-- Last AI brief (audience, focus, tone) of each landing, reused when regenerating.
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS ai_brief jsonb;
