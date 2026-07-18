import { config } from '../config/index.js'
import { pool } from './pool.js'
import { normalizeCaseData } from '../lib/onboarding-normalizers.js'
import { httpError } from '@tx-bootstrap/core/server/http/errors.js'
import type { PatchStateInput, StateRow, UpsertStateInput } from '../types.js'

let dbReady: Promise<unknown> | null = null

export async function ensureDb(): Promise<void> {
  if (!dbReady) {
    dbReady = pool.query('SELECT 1 FROM onboarding_state LIMIT 0')
  }
  await dbReady
}

export async function loadStateRow(): Promise<StateRow | null> {
  await ensureDb()
  const { rows } = await pool.query<StateRow>('SELECT * FROM onboarding_state WHERE id=$1', [config.stateId])
  return rows[0] ?? null
}

export async function requireStateRow(): Promise<StateRow> {
  const row = await loadStateRow()
  if (!row) throw httpError(409, 'No onboarding case has been created yet')
  return row
}

export async function upsertState({
  state,
  caseId,
  participantToken,
  caseData,
  credentialRequest,
  credentials,
  lastError,
  input,
}: UpsertStateInput): Promise<void> {
  const normalizedCase = normalizeCaseData(caseData)
  await ensureDb()
  await pool.query(
    `INSERT INTO onboarding_state (
       id, state, case_id, participant_token, organization_name, requested_bpn, assigned_bpn,
       did, dsp_endpoint, identityhub_credential_service_endpoint, contact_email, requested_role,
       case_data, credential_request, credentials, last_error, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,now())
     ON CONFLICT (id) DO UPDATE SET
       state=EXCLUDED.state,
       case_id=EXCLUDED.case_id,
       participant_token=EXCLUDED.participant_token,
       organization_name=EXCLUDED.organization_name,
       requested_bpn=EXCLUDED.requested_bpn,
       assigned_bpn=EXCLUDED.assigned_bpn,
       did=EXCLUDED.did,
       dsp_endpoint=EXCLUDED.dsp_endpoint,
       identityhub_credential_service_endpoint=EXCLUDED.identityhub_credential_service_endpoint,
       contact_email=EXCLUDED.contact_email,
       requested_role=EXCLUDED.requested_role,
       case_data=EXCLUDED.case_data,
       credential_request=EXCLUDED.credential_request,
       credentials=EXCLUDED.credentials,
       last_error=EXCLUDED.last_error,
       updated_at=now()`,
    [
      config.stateId,
      state,
      caseId,
      participantToken,
      input.organizationName,
      normalizedCase.requestedBpn || input.requestedBpn,
      normalizedCase.assignedBpn || '',
      input.did,
      input.dspEndpoint,
      input.identityHubCredentialServiceEndpoint,
      input.contactEmail,
      input.requestedRole,
      JSON.stringify(caseData ?? {}),
      JSON.stringify(credentialRequest ?? {}),
      JSON.stringify(credentials ?? []),
      lastError || null,
    ],
  )
}

export async function patchState({
  state,
  caseData,
  credentialRequest,
  credentials,
  lastError,
}: PatchStateInput): Promise<void> {
  const normalizedCase = normalizeCaseData(caseData ?? {})
  await ensureDb()
  await pool.query(
    `UPDATE onboarding_state SET
       state=COALESCE($2, state),
       case_data=COALESCE($3::jsonb, case_data),
       credential_request=COALESCE($4::jsonb, credential_request),
       credentials=COALESCE($5::jsonb, credentials),
       assigned_bpn=COALESCE(NULLIF($6, ''), assigned_bpn),
       last_error=$7,
       updated_at=now()
     WHERE id=$1`,
    [
      config.stateId,
      state || null,
      caseData === undefined ? null : JSON.stringify(caseData ?? {}),
      credentialRequest === undefined ? null : JSON.stringify(credentialRequest ?? {}),
      credentials === undefined ? null : JSON.stringify(credentials ?? []),
      normalizedCase.assignedBpn || normalizedCase.bpn || '',
      lastError || null,
    ],
  )
}
