import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatchStateInput, StateRow } from '../types.js'

const mocks = vi.hoisted(() => ({
  dataspaceFetch: vi.fn(),
  identityHubFetch: vi.fn(),
  loadStateRow: vi.fn(),
  patchState: vi.fn(),
}))

vi.mock('../config/index.js', () => ({
  config: {
    onboardingRegistrationToken: '',
  },
  onboardingDefaults: () => ({
    organizationName: 'Provider',
    requestedBpn: 'BPNL000000000002',
    did: 'did:web:provider.example:BPNL000000000002',
    dspEndpoint: 'https://provider.example/api/v1/dsp',
    identityHubCredentialServiceEndpoint: 'https://provider.example/api/credentials',
    contactEmail: 'provider@example.org',
    requestedRole: 'participant',
  }),
}))

vi.mock('../clients/dataspace-admin-client.js', () => ({
  dataspaceFetch: mocks.dataspaceFetch,
}))

vi.mock('../clients/identityhub-client.js', () => ({
  assertIdentityHubConfigured: vi.fn(async () => undefined),
  getIdentityHubParticipantContextPathId: () => 'QlBOTDAwMDAwMDAwMDAwMg==',
  identityHubFetch: mocks.identityHubFetch,
}))

vi.mock('../db/state-repository.js', () => ({
  ensureDb: vi.fn(async () => undefined),
  loadStateRow: mocks.loadStateRow,
  patchState: mocks.patchState,
  requireStateRow: mocks.loadStateRow,
  upsertState: vi.fn(),
}))

import { buildStateResponse } from './onboarding-service.js'

describe('participant onboarding credential polling', () => {
  let row: StateRow

  beforeEach(() => {
    row = credentialRequestRow()
    mocks.loadStateRow.mockImplementation(async () => row)
    mocks.patchState.mockImplementation(async (patch: PatchStateInput) => {
      row = {
        ...row,
        state: patch.state ?? row.state,
        case_data: patch.caseData ?? row.case_data,
        credential_request: patch.credentialRequest ?? row.credential_request,
        credentials: patch.credentials ?? row.credentials,
        last_error: patch.lastError === undefined ? row.last_error : patch.lastError || null,
      }
    })
    mocks.dataspaceFetch.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') throw new Error('unexpected receipt')
      return row.case_data
    })
    mocks.identityHubFetch.mockImplementation(async (path: string) =>
      path.includes('/credentials/request/') ? { status: 'REQUESTED', holderPid: 'BPNL000000000002' } : [],
    )
  })

  it('polls without submitting another request or another requested receipt', async () => {
    const state = await buildStateResponse({ autoProgress: true })

    expect(state.state).toBe('CREDENTIALS_REQUESTED')
    expect(state.credentialRequestStatus).toEqual({
      status: 'REQUESTED',
      holderPid: 'BPNL000000000002',
    })
    expect(mocks.dataspaceFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/credential-receipts'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(mocks.identityHubFetch).toHaveBeenCalledTimes(2)
  })

  it('surfaces a terminal IdentityHub request error and stops automatic retries', async () => {
    mocks.identityHubFetch.mockImplementation(async (path: string) =>
      path.includes('/credentials/request/') ? { status: 'ERROR', holderPid: 'BPNL000000000002' } : [],
    )
    mocks.dataspaceFetch.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (options?.method === 'POST' && path.includes('/credential-receipts')) return row.case_data
      return row.case_data
    })

    const failed = await buildStateResponse({ autoProgress: true })
    const callsAfterFailure = mocks.identityHubFetch.mock.calls.length
    const unchanged = await buildStateResponse({ autoProgress: true })

    expect(failed.state).toBe('FAILED')
    expect(failed.lastError).toContain('IdentityHub credential request is ERROR')
    expect(unchanged.state).toBe('FAILED')
    expect(mocks.identityHubFetch).toHaveBeenCalledTimes(callsAfterFailure)
    expect(mocks.dataspaceFetch).toHaveBeenCalledWith(
      expect.stringContaining('/credential-receipts'),
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ status: 'failed' }),
      }),
    )
  })
})

function credentialRequestRow(): StateRow {
  const credentialRequest = {
    holderPid: 'BPNL000000000002',
    issuerDid: 'did:web:issuer.example:BPNL000000000001',
    credentials: [{ id: 'membership', type: 'MembershipCredential', format: 'ldp_vc' }],
  }
  return {
    id: 'participant',
    state: 'CREDENTIALS_REQUESTED',
    case_id: 'case-1',
    participant_token: 'participant-token',
    assigned_bpn: 'BPNL000000000002',
    case_data: {
      id: 'case-1',
      state: 'CREDENTIALS_REQUESTED',
      credentialRequest,
    },
    credential_request: credentialRequest,
    credentials: [],
    last_error: null,
    updated_at: new Date().toISOString(),
  }
}
