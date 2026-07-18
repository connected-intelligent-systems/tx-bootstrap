CREATE TABLE IF NOT EXISTS onboarding_state (
  id text PRIMARY KEY,
  state text NOT NULL,
  case_id text,
  participant_token text,
  organization_name text,
  requested_bpn text,
  assigned_bpn text,
  did text,
  dsp_endpoint text,
  identityhub_credential_service_endpoint text,
  contact_email text,
  requested_role text,
  case_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  credential_request jsonb NOT NULL DEFAULT '{}'::jsonb,
  credentials jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  token_hash text NOT NULL,
  token_hint text NOT NULL,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_clients_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS api_clients_active_token_idx
  ON api_clients (id)
  WHERE revoked_at IS NULL;
