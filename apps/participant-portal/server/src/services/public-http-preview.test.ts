import type { LookupAddress } from 'node:dns'
import { describe, expect, it } from 'vitest'
import { isAllowedPrivatePreviewHost, isForbiddenIpAddress, selectPreviewAddress } from './public-http-preview.js'

describe('public HTTP preview address policy', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '224.0.0.1',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    'ff00::1',
    '2001:db8::1',
    '3fff::1',
    'fec0::1',
  ])('rejects non-public address %s', (address) => {
    expect(isForbiddenIpAddress(address)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('accepts public address %s', (address) => {
    expect(isForbiddenIpAddress(address)).toBe(false)
  })

  it('rejects a hostname when any resolved address is non-public', () => {
    const addresses: LookupAddress[] = [
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]

    expect(() => selectPreviewAddress(addresses)).toThrow('public network addresses')
  })

  it('selects a resolved public address for a pinned connection', () => {
    const address = { address: '2606:4700:4700::1111', family: 6 } satisfies LookupAddress
    expect(selectPreviewAddress([address])).toEqual(address)
  })

  it('selects a private address only when its hostname was explicitly allowed', () => {
    const address = { address: '172.20.0.12', family: 4 } satisfies LookupAddress

    expect(() => selectPreviewAddress([address])).toThrow('public network addresses')
    expect(selectPreviewAddress([address], true)).toEqual(address)
  })

  it('matches allowed private hosts exactly after hostname normalization', () => {
    expect(isAllowedPrivatePreviewHost('Provider-DID.', ['provider-did'])).toBe(true)
    expect(isAllowedPrivatePreviewHost('provider-did.attacker.test', ['provider-did'])).toBe(false)
  })
})
