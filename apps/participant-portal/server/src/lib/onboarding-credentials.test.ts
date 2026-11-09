import { describe, expect, it } from 'vitest'
import { hasExpectedCredentials } from './onboarding-credentials.js'

const issuer = 'did:web:issuer.example'
const did = 'did:web:participant.example'
const now = Date.parse('2026-11-09T12:00:00Z')
const request = { issuerDid: issuer, credentials: [{ id: 'definition-id', type: 'MembershipCredential' }] }
const credential = {
  id: 'credential-id',
  type: ['VerifiableCredential', 'MembershipCredential'],
  issuer,
  credentialSubject: { id: did },
  issuanceDate: '2026-11-01T00:00:00Z',
  expirationDate: '2027-11-01T00:00:00Z',
}
const resource = { id: 'wallet-id', state: 500, verifiableCredential: { credential } }

describe('matching issued onboarding credentials', () => {
  it('accepts usable credentials for the requested issuer and subject', () => {
    expect(hasExpectedCredentials([resource], request, did, now)).toBe(true)
  })

  it.each([
    { issuer: 'did:web:other' },
    { credentialSubject: { id: 'did:web:other' } },
    { credentialSubject: undefined },
    { type: ['VerifiableCredential', 'OtherCredential'] },
    { expirationDate: '2026-11-09T12:00:00Z' },
    { expirationDate: 'invalid' },
    { validUntil: '2026-11-08T00:00:00Z' },
    { issuanceDate: '2026-11-10T00:00:00Z' },
    { validFrom: '2026-11-10T00:00:00Z' },
  ])('rejects an unusable or unrelated VC: %j', (patch) => {
    expect(
      hasExpectedCredentials(
        [{ ...resource, verifiableCredential: { credential: { ...credential, ...patch } } }],
        request,
        did,
        now,
      ),
    ).toBe(false)
  })

  it.each([100, 300, 600, 700, 800, 900, -100, 'REVOKED', 'SUSPENDED', 'EXPIRED', undefined])(
    'rejects wallet state %s even when VC content is present',
    (state) => {
      expect(hasExpectedCredentials([{ ...resource, state }], request, did, now)).toBe(false)
    },
  )

  it('requires all requested types and never lets a matching ID override the type', () => {
    expect(
      hasExpectedCredentials(
        [resource],
        { ...request, credentials: [...request.credentials, { type: 'BpnCredential' }] },
        did,
        now,
      ),
    ).toBe(false)
    expect(
      hasExpectedCredentials(
        [
          {
            ...resource,
            id: 'definition-id',
            verifiableCredential: { credential: { ...credential, type: ['OtherCredential'] } },
          },
        ],
        request,
        did,
        now,
      ),
    ).toBe(false)
  })

  it('supports issuer objects, subject arrays, multiple types and content envelopes', () => {
    const value = {
      ...credential,
      issuer: { id: issuer },
      credentialSubject: [{ id: did }],
      type: ['VerifiableCredential', 'ExtraCredential', 'MembershipCredential'],
    }
    expect(
      hasExpectedCredentials(
        { content: [{ ...resource, verifiableCredential: { credential: value } }] },
        request,
        did,
        now,
      ),
    ).toBe(true)
  })

  it('does not complete onboarding without the requested issuer or participant identity', () => {
    expect(hasExpectedCredentials([resource], { credentials: request.credentials }, did, now)).toBe(false)
    expect(hasExpectedCredentials([resource], request, '', now)).toBe(false)
  })
})
