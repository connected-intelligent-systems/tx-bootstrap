import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatchStateInput, StateRow } from '../types.js'
import { encodeRegistrationToken } from '@tx-bootstrap/core/api/registration-token.js'
import { config } from '../config/index.js'

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
  getIdentityHubParticipantContextId: () => 'BPNL000000000002',
  identityHubFetch: mocks.identityHubFetch,
}))

vi.mock('../db/state-repository.js', () => ({
  ensureDb: vi.fn(async () => undefined),
  loadStateRow: mocks.loadStateRow,
  patchState: mocks.patchState,
  requireStateRow: mocks.loadStateRow,
  upsertState: vi.fn(),
}))

import { attachOnboardingCase, attachConfiguredOnboardingCase, buildStateResponse } from './onboarding-service.js'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  config.onboardingRegistrationToken = ''
})

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

  it.each(['did:web:unrelated-issuer', 'did:web:issuer.example:BPNL000000000001'])(
    'only completes onboarding for the requested issuer (%s)',
    async (issuer) => {
      mocks.dataspaceFetch.mockImplementation(async () => row.case_data)
      mocks.identityHubFetch.mockImplementation(async (path: string) =>
        path.endsWith('/credentials')
          ? [
              {
                id: 'membership-1',
                state: 500,
                verifiableCredential: {
                  credential: {
                    type: ['VerifiableCredential', 'MembershipCredential'],
                    issuer,
                    credentialSubject: { id: 'did:web:provider.example:BPNL000000000002' },
                  },
                },
              },
            ]
          : { status: 'REQUESTED' },
      )
      const response = await buildStateResponse({ autoProgress: true })
      expect(response.state).toBe(issuer === 'did:web:unrelated-issuer' ? 'CREDENTIALS_REQUESTED' : 'ONBOARDED')
      expect(mocks.dataspaceFetch.mock.calls.some(([, options]) => options?.body?.status === 'issued')).toBe(
        issuer !== 'did:web:unrelated-issuer',
      )
    },
  )
})

describe('reattaching a rotated invitation', () => {
  let row: StateRow
  beforeEach(() => {
    row = credentialRequestRow()
    row.participant_token = 'old-token'
    mocks.loadStateRow.mockImplementation(async () => row)
    mocks.patchState.mockImplementation(async (patch: PatchStateInput) => {
      row = {
        ...row,
        participant_token: patch.participantToken ?? row.participant_token,
        state: patch.state ?? row.state,
        case_data: patch.caseData ?? row.case_data,
        credential_request: patch.credentialRequest ?? row.credential_request,
        credentials: patch.credentials ?? row.credentials,
        last_error: patch.lastError ?? row.last_error,
      }
    })
    mocks.identityHubFetch.mockImplementation(async (path: string) =>
      path.endsWith('/credentials') ? [] : { status: 'REQUESTED' },
    )
    mocks.dataspaceFetch.mockImplementation(async (_path: string, options?: { token?: string }) => {
      if (options?.token !== 'new-token') throw Object.assign(new Error('Unauthorized'), { status: 401 })
      return row.case_data
    })
  })

  it.each(['manual', 'configured', 'monitor'])('saves and uses the validated replacement token (%s)', async (mode) => {
    const requestBefore = row.credential_request
    const registrationToken = encodeRegistrationToken({ caseId: row.case_id!, participantToken: 'new-token' })
    if (mode === 'manual') await attachOnboardingCase({ registrationToken })
    else {
      config.onboardingRegistrationToken = registrationToken
      if (mode === 'monitor') await buildStateResponse({ autoProgress: true })
      else await attachConfiguredOnboardingCase()
    }
    expect(row.participant_token).toBe('new-token')
    expect(row.credential_request).toEqual(requestBefore)
    expect(mocks.dataspaceFetch.mock.calls.every(([, options]) => options?.token === 'new-token')).toBe(true)
  })

  it('preserves the saved secret when a replacement does not authenticate', async () => {
    const registrationToken = encodeRegistrationToken({ caseId: row.case_id!, participantToken: 'invalid-token' })
    await expect(attachOnboardingCase({ registrationToken })).rejects.toMatchObject({ status: 401 })
    expect(row.participant_token).toBe('old-token')
    expect(mocks.patchState).not.toHaveBeenCalled()
  })

  it('continues with a newer saved token when the environment still contains an old one', async () => {
    row.participant_token = 'new-token'
    config.onboardingRegistrationToken = encodeRegistrationToken({
      caseId: row.case_id!,
      participantToken: 'old-token',
    })
    const response = await buildStateResponse({ autoProgress: true })
    expect(row.participant_token).toBe('new-token')
    expect(response.state).toBe('CREDENTIALS_REQUESTED')
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
