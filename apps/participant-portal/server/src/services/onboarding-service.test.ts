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

describe('participant revocation and readmission', () => {
  const issuerDid = 'did:web:issuer.example:BPNL000000000001'
  let row: StateRow
  let caseData: Record<string, unknown>
  let clock = 4_000_000_000_000

  beforeEach(() => {
    // The operator check is throttled per process; move the clock past it.
    clock += 120_000
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    mocks.dataspaceFetch.mockReset()
    mocks.identityHubFetch.mockReset()
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
    mocks.loadStateRow.mockImplementation(async () => row)
    mocks.dataspaceFetch.mockImplementation(async () => caseData)
  })

  it('notices an operator revocation after onboarding', async () => {
    row = { ...credentialRequestRow(), state: 'ONBOARDED' }
    caseData = { ...row.case_data, state: 'REVOKED' }

    const state = await buildStateResponse({ autoProgress: true })

    expect(state.state).toBe('REVOKED')
    expect(state.onboarded).toBe(false)
    expect(mocks.identityHubFetch).not.toHaveBeenCalled()
  })

  it.each([
    ['after seeing the revocation', 'REVOKED'],
    ['when revocation and readmission happened while it was not watching', 'ONBOARDED'],
  ])('removes the revoked credentials and requests new ones after readmission %s', async (_label, localState) => {
    row = { ...credentialRequestRow(), state: localState }
    const newRequest = {
      holderPid: 'BPNL000000000002-readmitted',
      issuerDid,
      credentials: [{ id: 'membership', type: 'MembershipCredential', format: 'ldp_vc' }],
    }
    caseData = { id: 'case-1', state: 'READY_FOR_PARTICIPANT', issuerDid, credentialRequest: newRequest }
    mocks.dataspaceFetch.mockImplementation(async (path: string, options?: { method?: string }) =>
      options?.method === 'POST' && path.includes('/credential-receipts')
        ? { ...caseData, state: 'CREDENTIALS_REQUESTED' }
        : caseData,
    )
    const wallet = [
      {
        id: 'old-membership',
        verifiableCredential: {
          credential: { type: ['VerifiableCredential', 'MembershipCredential'], issuer: issuerDid },
        },
      },
      {
        id: 'other-issuer',
        verifiableCredential: {
          credential: { type: ['VerifiableCredential', 'OtherCredential'], issuer: 'did:web:other' },
        },
      },
    ]
    mocks.identityHubFetch.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (options?.method === 'DELETE') {
        wallet.splice(
          wallet.findIndex((item) => path.endsWith('/' + item.id)),
          1,
        )
        return undefined
      }
      if (options?.method === 'POST') return undefined
      if (path.endsWith('/credentials')) return wallet
      return { status: 'REQUESTED' }
    })

    const state = await buildStateResponse({ autoProgress: true })

    const deletes = mocks.identityHubFetch.mock.calls.filter(([, options]) => options?.method === 'DELETE')
    expect(deletes.map(([path]) => path)).toEqual([expect.stringMatching(/\/credentials\/old-membership$/)])
    expect(mocks.identityHubFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/credentials\/request$/),
      expect.objectContaining({ method: 'POST', body: newRequest }),
    )
    expect(state.state).toBe('CREDENTIALS_REQUESTED')
  })

  it('leaves an onboarded participant alone while its request id is unchanged', async () => {
    row = { ...credentialRequestRow(), state: 'ONBOARDED' }
    caseData = { ...row.case_data, state: 'CREDENTIALS_REQUESTED' }
    mocks.identityHubFetch.mockImplementation(async () => [])

    await buildStateResponse({ autoProgress: true })

    expect(mocks.identityHubFetch.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)
    expect(row.state).toBe('ONBOARDED')
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
