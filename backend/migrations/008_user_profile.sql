ALTER TABLE users ADD COLUMN profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(profile)='object');
ALTER TABLE users ADD COLUMN avatar_id uuid;
ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0;
