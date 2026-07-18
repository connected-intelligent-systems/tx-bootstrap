import { describe, expect, it } from 'vitest'
import { encodeRegistrationToken } from '@tx-bootstrap/core/api/registration-token.js'
import { copy } from '../../i18n/onboarding'
import type { GatewayState } from '../../types/onboarding'
import {
  activeStepIndex,
  buildAttachPayload,
  buildDiagnostics,
  buildParticipantDetails,
  buildSetupSteps,
  derivePageState,
  friendlyErrorMessage,
  heroTitle,
  statusDescription,
} from './onboarding-view'

const t = copy.en

const defaults = {
  organizationName: 'Acme Manufacturing',
  requestedBpn: 'BPNL000000000001',
  did: 'did:web:participant.local.test',
  dspEndpoint: 'https://participant.local.test/api/dsp',
  identityHubCredentialServiceEndpoint: 'https://participant.local.test/api/credentials',
  contactEmail: 'ops@example.org',
  requestedRole: 'active',
}

function gatewayState(overrides: Partial<GatewayState> = {}): GatewayState {
  return {
    state: 'NOT_STARTED',
    onboarded: false,
    attachMode: false,
    defaults,
    credentials: [],
    ...overrides,
  }
}

describe('onboarding view state', () => {
  it.each([
    [gatewayState(), 'needsInvite'],
    [gatewayState({ attachMode: true }), 'attachingInvite'],
    [gatewayState({ caseId: 'case-1', state: 'REQUESTED' }), 'waitingForOperator'],
    [gatewayState({ caseId: 'case-1', state: 'READY_FOR_PARTICIPANT' }), 'settingUpCredentials'],
    [gatewayState({ caseId: 'case-1', state: 'FAILED' }), 'failed'],
    [gatewayState({ caseId: 'case-1', state: 'ACTIVE', onboarded: true }), 'ready'],
  ] as const)('maps gateway state to %s', (state, expected) => {
    expect(derivePageState(state)).toBe(expected)
  })

  it('derives the user-facing title and status text from the page state', () => {
    const state = gatewayState({ caseId: 'case-1', state: 'READY_FOR_PARTICIPANT' })

    expect(heroTitle(derivePageState(state), t)).toBe(t.heroSettingUpCredentials)
    expect(statusDescription(state, t)).toBe(t.operatorApprovedStatus)
  })

  it('builds progress steps and chooses the first unfinished step', () => {
    const steps = buildSetupSteps(gatewayState({ caseId: 'case-1', state: 'READY_FOR_PARTICIPANT' }), t)

    expect(steps.map((step) => step.state)).toEqual(['done', 'done', 'active'])
    expect(activeStepIndex(steps)).toBe(2)
  })
  it('describes IN_REVIEW as automatic setup without asking for approval', () => {
    const state = gatewayState({ caseId: 'case-1', state: 'IN_REVIEW' })

    expect(heroTitle(derivePageState(state), t)).toBe('Setting up participant access')
    expect(statusDescription(state, t)).toContain('automatically')
    expect(statusDescription(state, t)).not.toContain('approval')
  })
})

describe('participant details and diagnostics', () => {
  it('prefers case data over deployment defaults', () => {
    const details = buildParticipantDetails(
      gatewayState({
        case: {
          organizationName: 'Case Organization',
          requestedBpn: 'BPNL000000000099',
        },
      }),
    )

    expect(details.organizationName).toBe('Case Organization')
    expect(details.requestedBpn).toBe('BPNL000000000099')
    expect(details.did).toBe(defaults.did)
  })

  it('serializes the useful support fields into diagnostics', () => {
    const diagnostics = JSON.parse(
      buildDiagnostics(
        gatewayState({
          caseId: 'case-1',
          state: 'FAILED',
          lastError: 'IdentityHub unavailable',
          case: { state: 'REQUESTED', assignedBpn: 'BPNL000000000123' },
          credentials: [
            { id: 'credential-1', type: 'MembershipCredential', issuer: 'did:web:issuer', state: 'ISSUED' },
          ],
        }),
      ),
    ) as Record<string, unknown>

    expect(diagnostics).toMatchObject({
      gatewayState: 'FAILED',
      caseId: 'case-1',
      caseState: 'REQUESTED',
      assignedBpn: 'BPNL000000000123',
      credentialCount: 1,
      lastError: 'IdentityHub unavailable',
    })
  })
})

describe('operator invite handling', () => {
  it('requires a registration token', () => {
    expect(() => buildAttachPayload({ registrationToken: '  ' }, t)).toThrow(t.attachMissingFields)
  })

  it('rejects malformed registration tokens', () => {
    expect(() => buildAttachPayload({ registrationToken: 'not-a-registration-token' }, t)).toThrow(t.invalidInviteToken)
  })

  it('returns a registration token payload unchanged', () => {
    const token = encodeRegistrationToken({ caseId: 'case-1', participantToken: 'token-1' })

    expect(buildAttachPayload({ registrationToken: ' ' + token + ' ' }, t)).toEqual({
      registrationToken: token,
    })
  })

  it('maps common upstream errors to participant-facing messages', () => {
    expect(friendlyErrorMessage(new Error('404 not found'), t)).toBe(t.attachCaseNotFound)
    expect(friendlyErrorMessage(new Error('Forbidden token'), t)).toBe(t.attachTokenInvalid)
    expect(friendlyErrorMessage(new Error('fetch failed'), t)).toBe(t.operatorUnavailable)
    expect(friendlyErrorMessage(new Error('IdentityHub unavailable'), t)).toBe(t.identityHubUnavailable)
  })
})
