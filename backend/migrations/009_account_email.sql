ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
UPDATE users SET email_verified_at=created_at;
CREATE TABLE account_tokens (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('verify','reset')), token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_tokens_owner ON account_tokens(user_id,purpose);
CREATE TABLE account_mail (
 id uuid PRIMARY KEY, token_id uuid NOT NULL REFERENCES account_tokens(id) ON DELETE CASCADE,
 payload_ciphertext text, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz,
 last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_mail_queue ON account_mail(status,next_attempt_at);
REVOKE ALL ON account_tokens,account_mail FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
 EXECUTE format('REVOKE ALL ON account_tokens,account_mail FROM %I',r); END LOOP;
END $$;
