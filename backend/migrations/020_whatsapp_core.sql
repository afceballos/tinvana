-- WhatsApp sales module, stage 1: connected number per user, raw webhook events (deduplicated), contacts,
-- conversations and messages. The same account columns are what a future Embedded Signup will fill in.
CREATE TABLE whatsapp_accounts (
 id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 phone_number_id text NOT NULL UNIQUE, waba_id text NOT NULL, display_phone text, verified_name text, quality_rating text,
 token_ciphertext text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','connected','error')),
 last_error text, last_tested_at timestamptz, source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','embedded_signup')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id)
);
CREATE TABLE whatsapp_events (
 id uuid PRIMARY KEY, dedupe_key text NOT NULL UNIQUE, kind text NOT NULL CHECK(kind IN ('message','status','other')),
 phone_number_id text, user_id uuid REFERENCES users(id) ON DELETE CASCADE, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','ignored','failed')),
 attempts integer NOT NULL DEFAULT 0, error text, locked_at timestamptz,
 received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
CREATE INDEX whatsapp_events_due ON whatsapp_events(status,received_at);
CREATE TABLE whatsapp_contacts (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 phone text NOT NULL, profile_name text, first_origin jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,phone), UNIQUE(id,user_id)
);
CREATE TABLE whatsapp_conversations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 account_id uuid NOT NULL, contact_id uuid NOT NULL,
 stage text NOT NULL DEFAULT 'new', owner_mode text NOT NULL DEFAULT 'ai' CHECK(owner_mode IN ('ai','human')), handoff_reason text,
 last_customer_at timestamptz, last_message_at timestamptz, unread integer NOT NULL DEFAULT 0,
 offer_id uuid, offer_version integer, captured jsonb NOT NULL DEFAULT '{}', quote jsonb, order_id uuid,
 lock_token text, locked_until timestamptz, ai_tokens integer NOT NULL DEFAULT 0, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(account_id,user_id) REFERENCES whatsapp_accounts(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(contact_id,user_id) REFERENCES whatsapp_contacts(id,user_id) ON DELETE CASCADE,
 UNIQUE(account_id,contact_id), UNIQUE(id,user_id)
);
CREATE INDEX whatsapp_conversations_inbox ON whatsapp_conversations(user_id,last_message_at DESC,id);
CREATE TABLE whatsapp_messages (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, conversation_id uuid NOT NULL,
 direction text NOT NULL CHECK(direction IN ('in','out')), type text NOT NULL, body text NOT NULL DEFAULT '', payload jsonb,
 wamid text UNIQUE, status text NOT NULL CHECK(status IN ('received','queued','sent','delivered','read','played','failed')),
 sender text NOT NULL CHECK(sender IN ('customer','ai','agent','template','system')), author_id uuid REFERENCES users(id) ON DELETE SET NULL,
 tokens integer NOT NULL DEFAULT 0, error text,
 created_at timestamptz NOT NULL DEFAULT now(), status_at timestamptz,
 FOREIGN KEY(conversation_id,user_id) REFERENCES whatsapp_conversations(id,user_id) ON DELETE CASCADE
);
CREATE INDEX whatsapp_messages_thread ON whatsapp_messages(conversation_id,created_at,id);
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_accounts,whatsapp_events,whatsapp_contacts,whatsapp_conversations,whatsapp_messages FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.whatsapp_accounts,public.whatsapp_events,public.whatsapp_contacts,public.whatsapp_conversations,public.whatsapp_messages FROM %I',r);
 END LOOP;
END $$;
