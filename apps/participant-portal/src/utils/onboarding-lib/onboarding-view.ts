import type { AlertColor } from '@mui/material'
import { getErrorMessage } from '../onboarding-api'
import { decodeRegistrationToken } from '@tx-bootstrap/core/api/registration-token.js'
import type { UiCopy } from '../../i18n/onboarding'
import type { GatewayState, ParticipantDetails, SetupStep } from '../../types/onboarding'

export type Message = { tone: 'ok' | 'info' | 'error'; text: string }
export type PageState =
  'needsInvite' | 'attachingInvite' | 'waitingForOperator' | 'settingUpCredentials' | 'failed' | 'ready'
export type InviteInput = { registrationToken: string }

export function buildParticipantDetails(state: GatewayState): ParticipantDetails {
  const caseData = state.case ?? {}
  const defaults = state.defaults
  return {
    organizationName: caseData.organizationName || defaults.organizationName,
    requestedBpn: caseData.requestedBpn || defaults.requestedBpn,
    did: caseData.did || defaults.did,
    dspEndpoint: caseData.dspEndpoint || defaults.dspEndpoint,
    identityHubCredentialServiceEndpoint:
      caseData.identityHubCredentialServiceEndpoint || defaults.identityHubCredentialServiceEndpoint,
    contactEmail: caseData.contactEmail || defaults.contactEmail,
    requestedRole: caseData.requestedRole || defaults.requestedRole,
  }
}

export function buildSetupSteps(state: GatewayState, t: UiCopy): SetupStep[] {
  const inviteConfigured = Boolean(state.caseId || state.attachMode)
  const inviteAttached = Boolean(state.caseId) && state.state !== 'FAILED'
  const approved = isApproved(state)
  const accessDone = state.onboarded

  return [
    {
      label: t.operatorInvite,
      detail: inviteAttached
        ? t.preregistrationAttached
        : inviteConfigured
          ? t.preregistrationAttaching
          : t.preregistrationMissingDetail,
      owner: inviteAttached ? t.ownerGateway : t.ownerOperator,
      nextAction: inviteAttached ? t.nextGatewayMetadata : t.nextConfigureInvite,
      state: inviteAttached ? 'done' : inviteConfigured ? 'active' : 'waiting',
    },
    {
      label: t.connectorMetadata,
      detail: inviteAttached ? t.submittedMetadata : t.waitingForPreregistration,
      owner: approved ? t.ownerGateway : t.ownerOperator,
      nextAction: approved ? t.nextGatewayCredentials : t.nextWaitForOperator,
      state: approved ? 'done' : inviteAttached ? 'active' : 'waiting',
    },
    {
      label: t.credentialsAndAccess,
      detail: accessDone ? t.credentialsIssued : approved ? t.requestingCredentials : t.credentialSetupAutomatic,
      owner: accessDone ? t.ownerParticipant : t.ownerGateway,
      nextAction: accessDone ? t.nextOpenPortal : approved ? t.nextGatewayCredentials : t.nextWaitForOperator,
      state: accessDone ? 'done' : approved ? 'active' : 'waiting',
    },
  ]
}

export function activeStepIndex(steps: SetupStep[]) {
  const activeIndex = steps.findIndex((step) => step.state !== 'done')
  return activeIndex === -1 ? steps.length - 1 : activeIndex
}

export function derivePageState(state: GatewayState): PageState {
  if (state.onboarded) return 'ready'
  if (state.state === 'FAILED') return 'failed'
  if (!state.caseId && state.attachMode) return 'attachingInvite'
  if (!state.caseId) return 'needsInvite'
  if (isApproved(state)) return 'settingUpCredentials'
  return 'waitingForOperator'
}

export function isApproved(state: GatewayState) {
  const caseState = state.case?.state || state.state || ''
  return ['READY_FOR_PARTICIPANT', 'CREDENTIALS_REQUESTED', 'ONBOARDED'].includes(caseState) || state.onboarded
}

export function heroTitle(pageState: PageState, t: UiCopy) {
  switch (pageState) {
    case 'needsInvite':
      return t.heroNeedsInvite
    case 'attachingInvite':
      return t.heroAttachingInvite
    case 'waitingForOperator':
      return t.heroWaitingForOperator
    case 'settingUpCredentials':
      return t.heroSettingUpCredentials
    case 'failed':
      return t.heroFailed
    case 'ready':
      return t.readyForPortal
  }
}

export function statusDescription(state: GatewayState, t: UiCopy) {
  switch (derivePageState(state)) {
    case 'ready':
      return t.readyStatus
    case 'failed':
      return t.failedStatus
    case 'needsInvite':
      return t.preregistrationMissingStatus
    case 'attachingInvite':
      return t.preregistrationAttaching
    case 'settingUpCredentials':
      return t.operatorApprovedStatus
    case 'waitingForOperator':
      return t.waitingForOperatorStatus
  }
}

export function buildAttachPayload(input: InviteInput, t: UiCopy) {
  const registrationToken = input.registrationToken.trim()
  if (!registrationToken) throw new Error(t.attachMissingFields)
  try {
    decodeRegistrationToken(registrationToken)
  } catch {
    throw new Error(t.invalidInviteToken)
  }
  return { registrationToken }
}

export function friendlyErrorMessage(error: unknown, t: UiCopy) {
  const message = getErrorMessage(error)
  const lower = message.toLowerCase()
  if (lower.includes('registrationtoken') && lower.includes('required')) return t.attachMissingFields
  if (lower.includes('not found') || lower.includes('404')) return t.attachCaseNotFound
  if (lower.includes('identityhub')) return t.identityHubUnavailable
  if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('token'))
    return t.attachTokenInvalid
  if (lower.includes('fetch failed') || lower.includes('econnrefused') || lower.includes('operator'))
    return t.operatorUnavailable
  return message
}

export function buildDiagnostics(state: GatewayState) {
  return JSON.stringify(
    {
      gatewayState: state.state,
      onboarded: state.onboarded,
      attachMode: state.attachMode,
      caseId: state.caseId,
      caseState: state.case?.state,
      requestedBpn: state.case?.requestedBpn || state.defaults.requestedBpn,
      assignedBpn: state.case?.assignedBpn || state.case?.bpn,
      did: state.case?.did || state.defaults.did,
      dspEndpoint: state.case?.dspEndpoint || state.defaults.dspEndpoint,
      credentialService:
        state.case?.identityHubCredentialServiceEndpoint || state.defaults.identityHubCredentialServiceEndpoint,
      credentialCount: state.credentials.length,
      credentialRequestStatus: state.credentialRequestStatus,
      lastError: state.lastError,
      updatedAt: state.updatedAt,
      setupChecks: state.case?.setupChecks,
    },
    null,
    2,
  )
}

export function messageSeverity(tone: Message['tone']): AlertColor {
  if (tone === 'ok') return 'success'
  if (tone === 'error') return 'error'
  return 'info'
}
