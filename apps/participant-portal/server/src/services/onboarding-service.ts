import { config, onboardingDefaults } from '../config/index.js'
import { dataspaceFetch } from '../clients/dataspace-admin-client.js'
import {
  assertIdentityHubConfigured,
  getIdentityHubParticipantContextPathId,
  identityHubFetch,
} from '../clients/identityhub-client.js'
import { ensureDb, loadStateRow, patchState, requireStateRow, upsertState } from '../db/state-repository.js'
import { httpError } from '@tx-bootstrap/core/server/http/errors.js'
import { decodeRegistrationToken } from '@tx-bootstrap/core/api/registration-token.js'
import { isRecord } from '../lib/objects.js'
import { extractCredentials, normalizeCaseData, normalizeOnboardingInput } from '../lib/onboarding-normalizers.js'
import { preserveCredentialRequestState } from '../lib/onboarding-state.js'
import { hasExpectedCredentials } from '../lib/onboarding-credentials.js'
import { errorMessage } from '../types.js'
import type { CredentialSummary, ExpectedCredential, JsonRecord, OnboardingInput, StateRow } from '../types.js'

const participantReadyStates = ['READY_FOR_PARTICIPANT', 'CREDENTIALS_REQUESTED']
let autoProgressPromise: Promise<void> | null = null
// After onboarding, the background monitor checks the operator case once a
// minute to notice revocation and readmission. Portal page polling checks it
// at most every 30 seconds; the shorter throttle keeps it from skipping
// monitor ticks.
const monitorIntervalMs = 60_000
const operatorCheckIntervalMs = 30_000
let lastOperatorCheck = 0

type ParticipantStateRow = StateRow & { case_id: string; participant_token: string }

interface BuildStateOptions {
  autoProgress?: boolean
}

interface RequestCredentialOptions {
  returnRaw?: boolean
}

interface AttachCaseOptions {
  message?: string
}

interface ReceiptBody extends JsonRecord {
  status: string
  message: string
  credentials: unknown[]
}

interface ReceiptResult {
  warning: string
  caseData?: JsonRecord
}

interface InviteCredentials {
  caseId: string
  participantToken: string
}

export async function attachOnboardingCase(body: JsonRecord = {}): Promise<JsonRecord> {
  const { caseId, participantToken } = inviteCredentialsFromBody(body)

  const row = await loadStateRow()
  if (row?.case_id === caseId) return reattachCase(row, participantToken)
  return attachCase(caseId, participantToken, { message: 'Operator invite attached.' })
}

export async function attachConfiguredOnboardingCase(): Promise<JsonRecord> {
  const invite = configuredInviteCredentials()
  if (!invite) {
    throw httpError(
      409,
      'Participant preregistration is not configured. Set ONBOARDING_REGISTRATION_TOKEN from the operator invite.',
    )
  }

  const row = await loadStateRow()
  if (row?.case_id === invite.caseId) return reattachCase(row, invite.participantToken)
  return attachCase(invite.caseId, invite.participantToken, {
    message: 'Configured onboarding case attached.',
  })
}

async function reattachCase(row: StateRow, participantToken: string): Promise<JsonRecord> {
  return refreshOnboardingForRow(await replaceParticipantToken(row, participantToken))
}

async function replaceParticipantToken(row: StateRow, participantToken: string): Promise<StateRow> {
  if (row.participant_token === participantToken) return row
  const updated = { ...row, participant_token: participantToken }
  assertParticipantCase(updated)
  // Authenticate the replacement before changing the saved secret. Preserve
  // the request id and credentials so readmission can still detect old VCs.
  const caseData = await fetchCase(updated)
  await patchState({ participantToken, caseData, lastError: '' })
  return { ...updated, case_data: caseData }
}

export async function requestCredentials(): Promise<JsonRecord> {
  const row = await requireStateRow()
  return requestCredentialsForRow(row)
}

export async function refreshOnboarding(): Promise<JsonRecord> {
  const row = await requireStateRow()
  return refreshOnboardingForRow(row)
}

export async function buildStateResponse(options: BuildStateOptions = {}): Promise<JsonRecord> {
  if (options.autoProgress) await autoProgressOnboarding()
  return buildRawStateResponse()
}

// Keeps onboarding moving, and follows revocation and readmission, while
// nobody has the portal open. Returns a function that stops it.
export function startOnboardingMonitor(intervalMs = monitorIntervalMs): () => void {
  const timer = setInterval(() => {
    autoProgressOnboarding().catch((error) => {
      console.warn('Onboarding check failed:', errorMessage(error, 'unknown error'))
    })
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}

export async function isOnboarded(): Promise<boolean> {
  await ensureDb()
  const row = await loadStateRow()
  return row?.state === 'ONBOARDED'
}

async function autoProgressOnboarding(): Promise<void> {
  if (autoProgressPromise) return autoProgressPromise
  autoProgressPromise = runAutoProgress().finally(() => {
    autoProgressPromise = null
  })
  return autoProgressPromise
}

async function runAutoProgress(): Promise<void> {
  await ensureDb()
  let row = await loadStateRow()

  if (!row && hasConfiguredCase()) {
    try {
      await attachConfiguredOnboardingCase()
    } catch (error) {
      await recordAttachFailure(error)
      return
    }
    row = await loadStateRow()
  }

  if (!row || !row.case_id) return
  const invite = tryConfiguredInviteCredentials()
  if (invite?.caseId === row.case_id && invite.participantToken !== row.participant_token) {
    try {
      row = await replaceParticipantToken(row, invite.participantToken)
    } catch {
      // A manually attached secret can be newer than the environment. Keep
      // using the saved secret unless the configured replacement authenticates.
    }
  }
  if (row.state === 'ONBOARDED' || row.state === 'FAILED' || row.state === 'REVOKED') {
    if (!(await checkOperatorAccess(row))) return
    row = await loadStateRow()
    if (!row) return
  }

  const refreshed = await refreshOnboardingForRow(row)
  row = await loadStateRow()
  const refreshedCase = isRecord(refreshed.case) ? refreshed.case : {}
  const caseState = String(refreshedCase.state ?? row?.state ?? '')

  if (!row || row.state === 'ONBOARDED') return
  if (!participantReadyStates.includes(caseState)) return

  const credentialRequestKnown = hasCredentialRequest(row.credential_request)
  let requestedCredentials = false
  if (!credentialRequestKnown || row.state !== 'CREDENTIALS_REQUESTED') {
    try {
      await requestCredentialsForRow(row, { returnRaw: true })
      requestedCredentials = true
    } catch {
      return
    }
    row = await loadStateRow()
  }

  if (requestedCredentials && row && row.state !== 'ONBOARDED') {
    await refreshOnboardingForRow(row)
  }
}

/**
 * Follows the operator's revocation and readmission of this participant.
 * Returns true when the participant was readmitted and should request new
 * credentials.
 */
async function checkOperatorAccess(row: StateRow): Promise<boolean> {
  if (!row.case_id || !row.participant_token) return false
  const now = Date.now()
  if (now - lastOperatorCheck < operatorCheckIntervalMs) return false
  lastOperatorCheck = now

  let caseData: JsonRecord
  try {
    caseData = await fetchCase(row as ParticipantStateRow)
  } catch {
    return false
  }
  const caseState = String(caseData.state ?? '')
  if (caseState === 'REVOKED') {
    if (row.state !== 'REVOKED') {
      await patchState({ state: 'REVOKED', caseData, lastError: 'The operator revoked this participant.' })
    }
    return false
  }
  if (!participantReadyStates.includes(caseState)) return false
  // Readmission gives the case a new credential request id. Comparing ids
  // also catches a revocation and readmission that both happened while the
  // portal was not watching, so it never saw the REVOKED state.
  const caseRequestId = credentialRequestHolderPid(caseData.credentialRequest ?? caseData.credential_request)
  const localRequestId = credentialRequestHolderPid(row.credential_request)
  const readmitted =
    row.state === 'REVOKED' || (!!caseRequestId && !!localRequestId && caseRequestId !== localRequestId)
  if (!readmitted) return false

  // Readmitted. Verifiers reject a presentation that still contains a revoked
  // credential, so the issuer's old credentials are removed before new ones
  // are requested under the case's new request id.
  try {
    await assertIdentityHubConfigured()
    await removeIssuerCredentials(String(caseData.issuerDid ?? ''))
  } catch (error) {
    await patchState({ caseData, lastError: errorMessage(error, 'Could not remove revoked credentials') })
    return false
  }
  const credentialRequest = credentialRequestFromCase(caseData, {})
  await patchState({ state: caseState, caseData, credentialRequest, credentials: [], lastError: '' })
  return true
}

async function removeIssuerCredentials(issuerDid: string): Promise<void> {
  if (!issuerDid) return
  const base = '/v1alpha/participants/' + encodeURIComponent(getIdentityHubParticipantContextPathId()) + '/credentials'
  const credentials = extractCredentials(await identityHubFetch(base))
  for (const credential of credentials.filter((item) => item.issuer === issuerDid)) {
    await identityHubFetch(base + '/' + encodeURIComponent(credential.id), { method: 'DELETE' })
  }
}

async function requestCredentialsForRow(row: StateRow, options: RequestCredentialOptions = {}): Promise<JsonRecord> {
  assertParticipantCase(row)
  await assertIdentityHubConfigured()

  let credentialRequest = credentialRequestFromCase(row.case_data, row.credential_request)

  try {
    if (!hasCredentialRequest(credentialRequest)) credentialRequest = await fetchCredentialRequest(row)

    let alreadyQueued = false
    try {
      await identityHubFetch(
        '/v1alpha/participants/' +
          encodeURIComponent(getIdentityHubParticipantContextPathId()) +
          '/credentials/request',
        { method: 'POST', body: credentialRequest },
      )
    } catch (error) {
      if (!isConflict(error)) throw error
      alreadyQueued = true
    }

    const receipt = await reportReceipt(row.case_id, row.participant_token, {
      status: 'requested',
      message: alreadyQueued
        ? 'Credential request already exists in participant IdentityHub.'
        : 'Credential request submitted by participant portal gateway.',
      credentials: expectedCredentials(credentialRequest),
    })
    const caseData = receipt.caseData ?? (await fetchCase(row))
    credentialRequest = credentialRequestFromCase(caseData, credentialRequest)

    await patchState({
      state: 'CREDENTIALS_REQUESTED',
      caseData,
      credentialRequest,
      lastError: receipt.warning,
    })

    const response = await buildRawStateResponse()
    return {
      ...response,
      message: receipt.warning
        ? 'Credential request recorded; receipt report failed: ' + receipt.warning
        : alreadyQueued
          ? 'Credential request already exists in IdentityHub.'
          : 'Credential request submitted to IdentityHub.',
    }
  } catch (error) {
    const message = errorMessage(error, 'IdentityHub credential request failed')
    await reportReceipt(row.case_id, row.participant_token, {
      status: 'failed',
      message,
      credentials: expectedCredentials(credentialRequest),
    })
    await patchState({ state: 'FAILED', credentialRequest, lastError: message })
    if (options.returnRaw) return buildRawStateResponse()
    throw error
  }
}

async function refreshOnboardingForRow(row: StateRow): Promise<JsonRecord> {
  assertParticipantCase(row)

  let caseData = normalizeCaseData(row.case_data)
  let credentialRequest: unknown = row.credential_request ?? {}
  let credentials: CredentialSummary[] = extractCredentials(row.credentials)
  let credentialRequestStatus = identityHubRequestStatusFromCase(caseData)
  let lastError = ''
  let issued = false
  let requestFailed = false
  let receiptWarning = ''

  try {
    caseData = await fetchCase(row)
    credentialRequest = credentialRequestFromCase(caseData, credentialRequest)
    try {
      caseData = await publishTechnicalMetadata(row, caseData)
      credentialRequest = credentialRequestFromCase(caseData, credentialRequest)
    } catch (error) {
      lastError = errorMessage(error, 'Could not publish participant metadata')
    }
  } catch (error) {
    lastError = errorMessage(error, 'Could not refresh onboarding case')
  }

  const caseState = String(caseData.state ?? row.state ?? '')
  if (participantReadyStates.includes(caseState)) {
    try {
      await assertIdentityHubConfigured()
      if (!hasCredentialRequest(credentialRequest)) {
        credentialRequest = await fetchCredentialRequest(row)
      }

      if (hasCredentialRequest(credentialRequest)) {
        const holderPid = credentialRequestHolderPid(credentialRequest)
        if (holderPid && (row.state === 'CREDENTIALS_REQUESTED' || caseState === 'CREDENTIALS_REQUESTED')) {
          try {
            credentialRequestStatus = await identityHubFetch<JsonRecord>(
              '/v1alpha/participants/' +
                encodeURIComponent(getIdentityHubParticipantContextPathId()) +
                '/credentials/request/' +
                encodeURIComponent(holderPid),
            )
            if (String(credentialRequestStatus.status ?? '').toUpperCase() === 'ERROR') {
              requestFailed = true
              lastError =
                'IdentityHub credential request is ERROR for holder ' +
                holderPid +
                '. Inspect the participant IdentityHub warning log for the failed Holder Credential Request.'
            }
          } catch (error) {
            lastError = errorMessage(error, 'Could not read IdentityHub credential request status')
          }
        }

        const identityHubResponse = await identityHubFetch(
          '/v1alpha/participants/' + encodeURIComponent(getIdentityHubParticipantContextPathId()) + '/credentials',
        )
        credentials = extractCredentials(identityHubResponse)
        issued = hasExpectedCredentials(
          identityHubResponse,
          credentialRequest,
          String(caseData.did ?? onboardingDefaults().did ?? ''),
        )

        if (issued || requestFailed) {
          const receipt = await reportReceipt(row.case_id, row.participant_token, {
            status: issued ? 'issued' : 'failed',
            message: issued
              ? 'Expected credentials found in IdentityHub.'
              : 'Participant IdentityHub reports credential request status ERROR.',
            credentials,
          })
          receiptWarning = receipt.warning
          if (receipt.caseData) {
            caseData = receipt.caseData
            credentialRequest = credentialRequestFromCase(caseData, credentialRequest)
          }
        }
      }
    } catch (error) {
      lastError = errorMessage(error, 'Could not poll IdentityHub credentials')
    }
  }

  caseData = {
    ...caseData,
    identityHubCredentialRequest: credentialRequestStatus,
  }

  const nextState =
    issued && !receiptWarning
      ? 'ONBOARDED'
      : requestFailed
        ? 'FAILED'
        : preserveCredentialRequestState(row.state, caseState)
  await patchState({
    state: nextState,
    caseData,
    credentialRequest,
    credentials,
    lastError: nextState === 'ONBOARDED' ? '' : receiptWarning || lastError,
  })

  const response = await buildRawStateResponse()
  return {
    ...response,
    message:
      nextState === 'ONBOARDED' ? 'Participant credentials are issued. Opening portal.' : 'Onboarding state refreshed.',
  }
}

async function buildRawStateResponse(): Promise<JsonRecord> {
  const row = await loadStateRow()
  const defaults = onboardingDefaults()
  if (!row) {
    return {
      state: hasConfiguredCase() ? 'NOT_STARTED' : 'CONFIGURATION_REQUIRED',
      onboarded: false,
      attachMode: hasConfiguredCase(),
      defaults,
      credentials: [],
    }
  }

  return {
    state: row.state,
    onboarded: row.state === 'ONBOARDED',
    attachMode: hasConfiguredCase(),
    defaults,
    caseId: row.case_id || undefined,
    case: normalizeCaseData(row.case_data),
    credentials: extractCredentials(row.credentials),
    credentialRequest: row.credential_request ?? {},
    credentialRequestStatus: identityHubRequestStatusFromCase(row.case_data),
    lastError: row.last_error || undefined,
    updatedAt: row.updated_at,
  }
}

async function attachCase(
  caseId: string,
  participantToken: string,
  options: AttachCaseOptions = {},
): Promise<JsonRecord> {
  const payload = normalizeOnboardingInput(onboardingDefaults())
  const caseData = await dataspaceFetch<JsonRecord>('/onboarding-cases/' + encodeURIComponent(caseId), {
    token: participantToken,
  })
  const input = mergeInputWithCase(payload, caseData)
  await upsertState({
    state: String(caseData.state ?? 'REQUESTED'),
    caseId,
    participantToken,
    caseData,
    credentialRequest: credentialRequestFromCase(caseData, {}),
    credentials: [],
    lastError: '',
    input,
  })

  const row = await loadStateRow()
  if (row) await refreshOnboardingForRow(row)
  return {
    ...(await buildRawStateResponse()),
    message: options.message ?? 'Operator invite attached.',
  }
}

async function recordAttachFailure(error: unknown): Promise<void> {
  const payload = normalizeOnboardingInput(onboardingDefaults())
  const invite = tryConfiguredInviteCredentials()
  await upsertState({
    state: 'FAILED',
    caseId: invite?.caseId ?? '',
    participantToken: invite?.participantToken ?? '',
    caseData: {},
    credentialRequest: {},
    credentials: [],
    lastError: errorMessage(error, 'Configured onboarding case could not be attached'),
    input: payload,
  })
}

async function fetchCase(row: ParticipantStateRow): Promise<JsonRecord> {
  return dataspaceFetch<JsonRecord>('/onboarding-cases/' + encodeURIComponent(row.case_id), {
    token: row.participant_token,
  })
}

async function fetchCredentialRequest(row: ParticipantStateRow): Promise<unknown> {
  return dataspaceFetch('/onboarding-cases/' + encodeURIComponent(row.case_id) + '/credential-request', {
    token: row.participant_token,
  })
}

async function publishTechnicalMetadata(row: ParticipantStateRow, caseData: JsonRecord): Promise<JsonRecord> {
  const metadata = technicalMetadataFromDefaults()
  if (!metadata) return caseData
  if (
    caseData.state !== 'REQUESTED' &&
    caseData.did === metadata.did &&
    caseData.dspEndpoint === metadata.dspEndpoint &&
    caseData.identityHubCredentialServiceEndpoint === metadata.identityHubCredentialServiceEndpoint
  ) {
    return caseData
  }
  return dataspaceFetch<JsonRecord>('/onboarding-cases/' + encodeURIComponent(row.case_id) + '/technical-metadata', {
    method: 'PATCH',
    token: row.participant_token,
    body: metadata,
  })
}

async function reportReceipt(caseId: string, token: string, body: ReceiptBody): Promise<ReceiptResult> {
  try {
    const caseData = await dataspaceFetch<JsonRecord>(
      '/onboarding-cases/' + encodeURIComponent(caseId) + '/credential-receipts',
      {
        method: 'POST',
        token,
        body,
      },
    )
    return { warning: '', caseData }
  } catch (error) {
    return { warning: errorMessage(error, 'unknown error') }
  }
}

function assertParticipantCase(row: StateRow): asserts row is ParticipantStateRow {
  if (!row.case_id || !row.participant_token) {
    throw httpError(409, 'Onboarding case is missing local participant credentials')
  }
}
function inviteCredentialsFromBody(body: JsonRecord): InviteCredentials {
  const registrationToken = String(body.registrationToken ?? '').trim()
  if (!registrationToken) throw httpError(400, 'registrationToken is required to attach an operator invite')
  return decodeInviteCredentials(registrationToken, 'Invalid registration token')
}

function configuredInviteCredentials(): InviteCredentials | null {
  const registrationToken = config.onboardingRegistrationToken.trim()
  if (!registrationToken) return null
  return decodeInviteCredentials(registrationToken, 'ONBOARDING_REGISTRATION_TOKEN is invalid')
}

function tryConfiguredInviteCredentials(): InviteCredentials | null {
  try {
    return configuredInviteCredentials()
  } catch {
    return null
  }
}

function decodeInviteCredentials(registrationToken: string, message: string): InviteCredentials {
  try {
    return decodeRegistrationToken(registrationToken)
  } catch {
    throw httpError(400, message)
  }
}

function hasConfiguredCase(): boolean {
  return Boolean(config.onboardingRegistrationToken.trim())
}

function technicalMetadataFromDefaults(): JsonRecord | null {
  const defaults = normalizeOnboardingInput(onboardingDefaults())
  if (!defaults.did || !defaults.dspEndpoint || !defaults.identityHubCredentialServiceEndpoint) return null
  return {
    did: defaults.did,
    dspEndpoint: defaults.dspEndpoint,
    identityHubCredentialServiceEndpoint: defaults.identityHubCredentialServiceEndpoint,
  }
}

function mergeInputWithCase(input: OnboardingInput, caseData: unknown): OnboardingInput {
  if (!isRecord(caseData)) return input
  return {
    ...input,
    organizationName: String(caseData.organizationName ?? input.organizationName ?? ''),
    requestedBpn: String(caseData.requestedBpn ?? input.requestedBpn ?? ''),
    did: String(caseData.did ?? input.did ?? ''),
    dspEndpoint: String(caseData.dspEndpoint ?? input.dspEndpoint ?? ''),
    identityHubCredentialServiceEndpoint: String(
      caseData.identityHubCredentialServiceEndpoint ?? input.identityHubCredentialServiceEndpoint ?? '',
    ),
    contactEmail: String(caseData.contactEmail ?? input.contactEmail ?? ''),
    requestedRole: String(caseData.requestedRole ?? input.requestedRole ?? 'participant'),
  }
}

function credentialRequestFromCase(caseData: unknown, fallback: unknown = {}): unknown {
  if (hasCredentialRequest(fallback)) return fallback
  if (!isRecord(caseData)) return fallback ?? {}
  const candidate = caseData.credentialRequest ?? caseData.credential_request
  return hasCredentialRequest(candidate) ? candidate : (fallback ?? {})
}

function expectedCredentials(value: unknown): ExpectedCredential[] {
  if (!isRecord(value) || !Array.isArray(value.credentials)) return []
  return value.credentials.filter(isRecord) as ExpectedCredential[]
}

function hasCredentialRequest(value: unknown): boolean {
  return expectedCredentials(value).length > 0
}

function credentialRequestHolderPid(value: unknown): string {
  return isRecord(value) ? String(value.holderPid ?? '').trim() : ''
}

function identityHubRequestStatusFromCase(value: unknown): JsonRecord {
  if (!isRecord(value) || !isRecord(value.identityHubCredentialRequest)) return {}
  return value.identityHubCredentialRequest
}

function isConflict(error: unknown): boolean {
  return isRecord(error) && error.status === 409
}
