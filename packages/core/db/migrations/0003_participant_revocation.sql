-- Permanent participant revocation: when, why, and the result of each
-- revocation step (issuer holder block, credential revocation, BDRS removal,
-- tunnel keys). The access lease serialises revoke, readmit and the
-- revocation reconciler for one participant without holding a database
-- connection during remote calls.
ALTER TABLE business_partners
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revocation_reason text NOT NULL DEFAULT '',
  ADD COLUMN revocation_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN access_lease_token text,
  ADD COLUMN access_lease_until timestamptz;
