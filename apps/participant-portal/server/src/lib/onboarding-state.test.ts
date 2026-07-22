import { describe, expect, it } from 'vitest'
import { preserveCredentialRequestState } from './onboarding-state.js'

describe('preserveCredentialRequestState', () => {
  it('does not regress a locally submitted request while the operator still reports ready', () => {
    expect(preserveCredentialRequestState('CREDENTIALS_REQUESTED', 'READY_FOR_PARTICIPANT')).toBe(
      'CREDENTIALS_REQUESTED',
    )
  })

  it('accepts a newer operator state', () => {
    expect(preserveCredentialRequestState('REQUESTED', 'CREDENTIALS_REQUESTED')).toBe('CREDENTIALS_REQUESTED')
  })
})
