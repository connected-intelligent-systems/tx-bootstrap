CREATE TABLE IF NOT EXISTS business_partners (
  id uuid PRIMARY KEY,
  legal_name text NOT NULL,
  legal_form text NOT NULL DEFAULT '',
  registered_address text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  tax_id text NOT NULL DEFAULT '',
  commercial_register_number text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  requested_bpn text NOT NULL DEFAULT '',
  assigned_bpn text NOT NULL DEFAULT '',
  bpn_source text NOT NULL DEFAULT 'LOCAL',
  external_authority text NOT NULL DEFAULT '',
  verification_status text NOT NULL DEFAULT 'UNVERIFIED',
  verification_notes text NOT NULL DEFAULT '',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS local_bpn_sequence START WITH 1;

CREATE UNIQUE INDEX IF NOT EXISTS business_partners_assigned_bpn_unique
ON business_partners (assigned_bpn)
WHERE assigned_bpn <> '';

CREATE TABLE IF NOT EXISTS onboarding_cases (
  id uuid PRIMARY KEY,
  participant_token_hash text NOT NULL,
  business_partner_id uuid REFERENCES business_partners(id),
  organization_name text NOT NULL,
  requested_bpn text NOT NULL DEFAULT '',
  bpn text NOT NULL DEFAULT '',
  did text NOT NULL,
  dsp_endpoint text NOT NULL,
  identityhub_credential_service_endpoint text NOT NULL,
  contact_email text NOT NULL,
  requested_role text NOT NULL,
  state text NOT NULL DEFAULT 'REQUESTED',
  admin_notes text NOT NULL DEFAULT '',
  rejection_reason text NOT NULL DEFAULT '',
  issuer_did text NOT NULL,
  credential_request jsonb NOT NULL,
  setup_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  setup_attempt_count integer NOT NULL DEFAULT 0,
  setup_started_at timestamptz,
  setup_next_attempt_at timestamptz NOT NULL DEFAULT now(),
  credential_receipts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participant_events (
  id uuid PRIMARY KEY,
  business_partner_id uuid REFERENCES business_partners(id) ON DELETE SET NULL,
  onboarding_case_id uuid REFERENCES onboarding_cases(id) ON DELETE SET NULL,
  actor text NOT NULL DEFAULT '',
  action text NOT NULL,
  message text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS participant_events_business_partner_idx
ON participant_events (business_partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS participant_events_onboarding_case_idx
ON participant_events (onboarding_case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS onboarding_cases_automatic_setup_due_idx
ON onboarding_cases (setup_next_attempt_at, updated_at)
WHERE state = 'IN_REVIEW';

CREATE OR REPLACE FUNCTION onboarding_public_get_onboarding_case(
  p_case_id uuid,
  p_participant_token_hash text
)
RETURNS SETOF onboarding_cases
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM onboarding_cases
  WHERE id = p_case_id
    AND participant_token_hash = p_participant_token_hash;
$$;

CREATE OR REPLACE FUNCTION onboarding_public_create_onboarding_case(
  p_business_partner_id uuid,
  p_case_id uuid,
  p_participant_token_hash text,
  p_organization_name text,
  p_legal_form text,
  p_registered_address text,
  p_country text,
  p_tax_id text,
  p_commercial_register_number text,
  p_website text,
  p_contact_email text,
  p_requested_bpn text,
  p_bpn text,
  p_did text,
  p_dsp_endpoint text,
  p_identityhub_credential_service_endpoint text,
  p_requested_role text,
  p_issuer_did text,
  p_credential_request jsonb,
  p_setup_checks jsonb,
  p_credential_receipts jsonb,
  p_event_id uuid
)
RETURNS SETOF onboarding_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO business_partners (
    id,
    legal_name,
    legal_form,
    registered_address,
    country,
    tax_id,
    commercial_register_number,
    website,
    contact_email,
    requested_bpn
  ) VALUES (
    p_business_partner_id,
    p_organization_name,
    p_legal_form,
    p_registered_address,
    p_country,
    p_tax_id,
    p_commercial_register_number,
    p_website,
    p_contact_email,
    p_requested_bpn
  );

  INSERT INTO onboarding_cases (
    id,
    participant_token_hash,
    business_partner_id,
    organization_name,
    requested_bpn,
    bpn,
    did,
    dsp_endpoint,
    identityhub_credential_service_endpoint,
    contact_email,
    requested_role,
    issuer_did,
    credential_request,
    setup_checks,
    credential_receipts
  ) VALUES (
    p_case_id,
    p_participant_token_hash,
    p_business_partner_id,
    p_organization_name,
    p_requested_bpn,
    p_bpn,
    p_did,
    p_dsp_endpoint,
    p_identityhub_credential_service_endpoint,
    p_contact_email,
    p_requested_role,
    p_issuer_did,
    p_credential_request,
    p_setup_checks,
    p_credential_receipts
  );

  INSERT INTO participant_events (
    id,
    business_partner_id,
    onboarding_case_id,
    actor,
    action,
    message,
    payload
  ) VALUES (
    p_event_id,
    p_business_partner_id,
    p_case_id,
    'participant',
    'participant.registered',
    'Participant registration submitted.',
    jsonb_build_object('requestedBpn', p_requested_bpn)
  );

  RETURN QUERY SELECT * FROM onboarding_cases WHERE id = p_case_id;
END;
$$;

CREATE OR REPLACE FUNCTION onboarding_public_update_technical_metadata(
  p_case_id uuid,
  p_participant_token_hash text,
  p_did text,
  p_dsp_endpoint text,
  p_identityhub_credential_service_endpoint text,
  p_event_id uuid,
  p_payload jsonb
)
RETURNS SETOF onboarding_cases
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE onboarding_cases
       SET did = p_did,
           dsp_endpoint = p_dsp_endpoint,
           identityhub_credential_service_endpoint = p_identityhub_credential_service_endpoint,
           state = 'IN_REVIEW',
           setup_checks = '[]'::jsonb,
           setup_attempt_count = 0,
           setup_started_at = NULL,
           setup_next_attempt_at = now(),
           updated_at = now()
     WHERE id = p_case_id
       AND participant_token_hash = p_participant_token_hash
       AND state IN ('REQUESTED', 'IN_REVIEW', 'FAILED')
       AND setup_started_at IS NULL
     RETURNING *
  ), event_insert AS (
    INSERT INTO participant_events (
      id,
      business_partner_id,
      onboarding_case_id,
      actor,
      action,
      message,
      payload
    )
    SELECT
      p_event_id,
      business_partner_id,
      id,
      'participant',
      'participant.technical_metadata_submitted',
      'Participant stack reported technical metadata and queued automatic setup.',
      p_payload
    FROM updated
    RETURNING 1
  )
  SELECT * FROM updated;
$$;

CREATE OR REPLACE FUNCTION onboarding_public_append_credential_receipt(
  p_case_id uuid,
  p_participant_token_hash text,
  p_receipt jsonb,
  p_event_id uuid
)
RETURNS SETOF onboarding_cases
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE onboarding_cases
       SET credential_receipts = COALESCE(credential_receipts, '[]'::jsonb) || jsonb_build_array(p_receipt),
           updated_at = now()
     WHERE id = p_case_id
       AND participant_token_hash = p_participant_token_hash
       AND state IN ('READY_FOR_PARTICIPANT', 'CREDENTIALS_REQUESTED')
     RETURNING *
  ), event_insert AS (
    INSERT INTO participant_events (
      id,
      business_partner_id,
      onboarding_case_id,
      actor,
      action,
      message,
      payload
    )
    SELECT
      p_event_id,
      business_partner_id,
      id,
      'participant',
      'participant.credential_receipt_reported',
      COALESCE(NULLIF(p_receipt->>'message', ''), 'Credential receipt status: ' || COALESCE(p_receipt->>'status', 'reported')),
      p_receipt
    FROM updated
    RETURNING 1
  )
  SELECT * FROM updated;
$$;

CREATE OR REPLACE FUNCTION onboarding_public_list_network_participants()
RETURNS TABLE (name text, bpn text, did text, dsp_endpoint text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest_cases AS (
    SELECT DISTINCT ON (business_partner_id)
      business_partner_id, did, dsp_endpoint, credential_receipts
    FROM onboarding_cases
    WHERE business_partner_id IS NOT NULL
    ORDER BY business_partner_id, created_at DESC, id DESC
  )
  SELECT bp.legal_name, bp.assigned_bpn, latest.did, latest.dsp_endpoint
  FROM business_partners bp
  JOIN latest_cases latest ON latest.business_partner_id = bp.id
  WHERE bp.verification_status = 'VERIFIED'
    AND bp.assigned_bpn <> ''
    AND latest.did <> ''
    AND latest.dsp_endpoint <> ''
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(latest.credential_receipts, '[]'::jsonb)) receipt
      WHERE receipt->>'status' = 'issued'
    )
  ORDER BY lower(bp.legal_name), bp.assigned_bpn;
$$;

REVOKE ALL ON FUNCTION onboarding_public_get_onboarding_case(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION onboarding_public_create_onboarding_case(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION onboarding_public_update_technical_metadata(uuid, text, text, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION onboarding_public_append_credential_receipt(uuid, text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION onboarding_public_list_network_participants() FROM PUBLIC;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'operator_console') THEN
    GRANT USAGE ON SCHEMA public TO operator_console;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON business_partners, onboarding_cases, participant_events
      TO operator_console;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public
      TO operator_console;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'registration_svc') THEN
    REVOKE SELECT, INSERT, UPDATE, DELETE
      ON business_partners, onboarding_cases, participant_events
      FROM registration_svc;
    REVOKE USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public
      FROM registration_svc;
    GRANT USAGE ON SCHEMA public TO registration_svc;
    GRANT EXECUTE ON FUNCTION onboarding_public_get_onboarding_case(uuid, text)
      TO registration_svc;
    GRANT EXECUTE ON FUNCTION onboarding_public_create_onboarding_case(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid)
      TO registration_svc;
    GRANT EXECUTE ON FUNCTION onboarding_public_update_technical_metadata(uuid, text, text, text, text, uuid, jsonb)
      TO registration_svc;
    GRANT EXECUTE ON FUNCTION onboarding_public_append_credential_receipt(uuid, text, jsonb, uuid)
      TO registration_svc;
    GRANT EXECUTE ON FUNCTION onboarding_public_list_network_participants()
      TO registration_svc;
  END IF;
END $$;
