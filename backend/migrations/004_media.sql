CREATE TABLE media_assets (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 landing_page_id uuid NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
 bytes integer NOT NULL CHECK(bytes>0 AND bytes<=409600),
 width integer NOT NULL, height integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_assets_owner ON media_assets(user_id,landing_page_id);
REVOKE ALL ON media_assets FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
 IF EXISTS(SELECT FROM pg_roles WHERE rolname=role_name) THEN
 EXECUTE format('REVOKE ALL ON media_assets FROM %I',role_name);
 END IF; END LOOP;
END $$;
