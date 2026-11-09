-- Public onboarding runs as registration_svc, which deliberately has no
-- direct table privileges. Expose only email-verified token recovery.
CREATE FUNCTION onboarding_public_get_token_recovery_case(
  p_case_id uuid,
  p_contact_email text
)
RETURNS TABLE (id uuid, organization_name text, contact_email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.organization_name, bp.contact_email
  FROM public.onboarding_cases c
  JOIN public.business_partners bp ON bp.id = c.business_partner_id
  WHERE c.id = p_case_id
    AND lower(trim(bp.contact_email)) = lower(trim(p_contact_email))
    AND trim(p_contact_email) <> '';
$$;

CREATE FUNCTION onboarding_public_rotate_participant_token(
  p_case_id uuid,
  p_contact_email text,
  p_token_hash text
)
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.onboarding_cases c
  SET participant_token_hash = p_token_hash, updated_at = now()
  FROM public.business_partners bp
  WHERE c.id = p_case_id
    AND bp.id = c.business_partner_id
    AND lower(trim(bp.contact_email)) = lower(trim(p_contact_email))
    AND trim(p_contact_email) <> ''
    AND p_token_hash ~ '^[a-f0-9]{64}$'
  RETURNING c.id;
$$;

REVOKE ALL ON FUNCTION onboarding_public_get_token_recovery_case(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION onboarding_public_rotate_participant_token(uuid, text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'registration_svc') THEN
    GRANT EXECUTE ON FUNCTION onboarding_public_get_token_recovery_case(uuid, text) TO registration_svc;
    GRANT EXECUTE ON FUNCTION onboarding_public_rotate_participant_token(uuid, text, text) TO registration_svc;
  END IF;
END $$;
