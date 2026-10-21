ALTER TABLE media_assets ALTER COLUMN landing_page_id DROP NOT NULL;
ALTER TABLE media_assets DROP CONSTRAINT media_assets_landing_page_id_fkey;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_landing_page_id_fkey
 FOREIGN KEY (landing_page_id) REFERENCES landing_pages(id) ON DELETE SET NULL;
ALTER TABLE media_assets ADD COLUMN original_name varchar(200) NOT NULL DEFAULT '';
ALTER TABLE media_assets ADD COLUMN storage_path text;
CREATE INDEX media_assets_library ON media_assets(user_id,created_at DESC,id DESC);
