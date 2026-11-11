-- The panel guided tour starts by itself only once per account (any browser or device); the «?» button repeats it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_seen_at timestamptz;
