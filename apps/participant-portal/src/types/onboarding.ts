import type { ThemeMode as RuntimeThemeModeName } from '@tx-bootstrap/ui-runtime'

export type Defaults = {
  organizationName: string
  requestedBpn: string
  did: string
  dspEndpoint: string
  identityHubCredentialServiceEndpoint: string
  contactEmail: string
  requestedRole: string
}

export type OnboardingCase = {
  id?: string
  organizationName?: string
  requestedBpn?: string
  assignedBpn?: string
  bpn?: string
  did?: string
  dspEndpoint?: string
  identityHubCredentialServiceEndpoint?: string
  contactEmail?: string
  requestedRole?: string
  state?: string
  setupChecks?: Array<{ name: string; status: string; message: string }>
}

export type OnboardingCredential = {
  id: string
  type: string
  issuer: string
  state: string
}

export type GatewayState = {
  state: string
  onboarded: boolean
  attachMode: boolean
  defaults: Defaults
  caseId?: string
  case?: OnboardingCase
  credentials: OnboardingCredential[]
  credentialRequestStatus?: Record<string, unknown>
  lastError?: string
  updatedAt?: string
}

export type Language = 'en' | 'de'
export type ThemeMode = RuntimeThemeModeName

export type ParticipantDetails = Defaults
export type SetupStepState = 'done' | 'active' | 'waiting'
export type SetupStep = { label: string; detail: string; state: SetupStepState; owner: string; nextAction: string }
