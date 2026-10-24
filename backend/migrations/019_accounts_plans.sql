-- Superadmin role, account status, plans with features/limits, per-user overrides, global defaults and an admin audit log.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_v2 CHECK (role IN ('superadmin','admin','user'));
ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended'));
ALTER TABLE users ADD COLUMN plan_id uuid;
ALTER TABLE users ADD COLUMN plan_expires_at timestamptz;
ALTER TABLE users ADD COLUMN entitlement_overrides jsonb;
ALTER TABLE users ADD COLUMN admin_note text;
ALTER TABLE users ADD COLUMN last_login_at timestamptz;
CREATE TABLE plans (
 id uuid PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '',
 price integer CHECK (price IS NULL OR price>=0), currency text NOT NULL DEFAULT 'COP',
 period text NOT NULL DEFAULT 'month' CHECK (period IN ('free','month','year','once')),
 highlights jsonb NOT NULL DEFAULT '[]', features jsonb NOT NULL DEFAULT '{}', limits jsonb NOT NULL DEFAULT '{}',
 is_default integer NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)), active integer NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
 sort_order integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD CONSTRAINT users_plan_fk FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL;
CREATE INDEX users_plan ON users(plan_id);
CREATE TABLE app_settings (
 setting_key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_audit (
 id uuid PRIMARY KEY, actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 target_user_id uuid REFERENCES users(id) ON DELETE SET NULL, action text NOT NULL,
 data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_recent ON admin_audit(created_at);
CREATE INDEX admin_audit_target ON admin_audit(target_user_id,created_at);
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON plans,app_settings,admin_audit FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.plans,public.app_settings,public.admin_audit FROM %I',r);
 END LOOP;
END $$;
