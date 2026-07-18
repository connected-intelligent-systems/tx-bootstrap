import { onboardingDefaults } from '../config/index.js'
import { isRecord, text } from './objects.js'
import type { CredentialSummary, JsonRecord, OnboardingInput } from '../types.js'

type OnboardingInputSource = Partial<OnboardingInput> & { bpn?: unknown }

export function normalizeOnboardingInput(body: OnboardingInputSource = {}): OnboardingInput {
  const defaults = onboardingDefaults()
  return {
    organizationName: text(body.organizationName, defaults.organizationName),
    requestedBpn: text(body.requestedBpn ?? body.bpn, defaults.requestedBpn),
    did: text(body.did, defaults.did),
    dspEndpoint: text(body.dspEndpoint, defaults.dspEndpoint),
    identityHubCredentialServiceEndpoint: text(
      body.identityHubCredentialServiceEndpoint,
      defaults.identityHubCredentialServiceEndpoint,
    ),
    contactEmail: text(body.contactEmail, defaults.contactEmail),
    requestedRole: text(body.requestedRole, defaults.requestedRole || 'participant'),
  }
}

export function normalizeCaseData(value: unknown): JsonRecord {
  if (!isRecord(value)) return {}
  return value
}

export function extractCredentials(payload: unknown): CredentialSummary[] {
  const raw = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.credentials)
      ? payload.credentials
      : isRecord(payload) && Array.isArray(payload.content)
        ? payload.content
        : []

  return raw.map((item: unknown, index: number) => {
    const record = isRecord(item) ? item : {}
    const vcContainer = isRecord(record.verifiableCredential) ? record.verifiableCredential : record
    const credential = isRecord(vcContainer.credential)
      ? vcContainer.credential
      : isRecord(record.credential)
        ? record.credential
        : record
    const metadata = isRecord(record.metadata) ? record.metadata : {}
    const typeValue = credential.type || record.type || record.credentialType || metadata.credentialObjectId
    const types = Array.isArray(typeValue) ? typeValue : typeValue ? [typeValue] : []
    const issuerValue = credential.issuer || record.issuerId || record.issuer || ''
    const issuer = isRecord(issuerValue) ? issuerValue.id || '' : issuerValue
    return {
      id: String(record.id || credential.id || metadata.credentialObjectId || index),
      type: String(types.find((type) => type !== 'VerifiableCredential') || record.credentialType || 'credential'),
      issuer: String(issuer),
      state: String(record.status || (record.verifiableCredential ? 'ISSUED' : record.state || '')),
    }
  })
}
