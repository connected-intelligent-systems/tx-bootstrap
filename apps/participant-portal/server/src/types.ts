export type JsonRecord = Record<string, unknown>

export interface OnboardingInput {
  organizationName: string
  requestedBpn: string
  did: string
  dspEndpoint: string
  identityHubCredentialServiceEndpoint: string
  contactEmail: string
  requestedRole: string
}

export interface CredentialSummary {
  id: string
  type: string
  issuer: string
  state: string
}

export interface ExpectedCredential extends JsonRecord {
  id?: string
  type?: string
  format?: string
}

export interface StateRow {
  id: string
  state: string
  case_id: string | null
  participant_token: string | null
  assigned_bpn: string | null
  case_data: unknown
  credential_request: unknown
  credentials: unknown
  last_error: string | null
  updated_at: string | Date
}

export interface UpsertStateInput {
  state: string
  caseId: string
  participantToken: string
  caseData: unknown
  credentialRequest: unknown
  credentials: unknown[]
  lastError: string
  input: OnboardingInput
}

export interface PatchStateInput {
  state?: string
  caseData?: unknown
  credentialRequest?: unknown
  credentials?: unknown[]
  lastError?: string
}

export interface HttpError extends Error {
  status: number
  details?: unknown
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
