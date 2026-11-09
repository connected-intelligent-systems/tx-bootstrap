-- Only metadata is stored here. Enrollment keys are returned once to the admin.
CREATE TABLE network_enrollments (
  id uuid PRIMARY KEY,
  business_partner_id uuid NOT NULL REFERENCES business_partners(id),
  control_url text NOT NULL,
  participant_tag text NOT NULL,
  pre_auth_key_id text,
  state text NOT NULL CHECK (state IN ('CREATING', 'ISSUED', 'FAILED', 'REVOKING', 'REVOKED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pre_auth_key_id IS NULL OR pre_auth_key_id ~ '^[1-9][0-9]*$'),
  CHECK (state NOT IN ('ISSUED', 'REVOKING', 'REVOKED') OR pre_auth_key_id IS NOT NULL)
);

CREATE INDEX network_enrollments_participant_idx
ON network_enrollments (business_partner_id, created_at DESC);

-- A participant's tunnel hostname is derived from its BPN, so at most one
-- enrollment per participant may hold or claim it.
CREATE UNIQUE INDEX network_enrollments_one_active_per_participant
ON network_enrollments (business_partner_id)
WHERE state IN ('CREATING', 'ISSUED', 'REVOKING');

REVOKE ALL ON network_enrollments FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'operator_console') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON network_enrollments TO operator_console;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'registration_svc') THEN
    REVOKE ALL ON network_enrollments FROM registration_svc;
  END IF;
END $$;
