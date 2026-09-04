import type { LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream'
import { httpError } from '@tx-bootstrap/core/server/http/errors.js'

const blockedIpv4 = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, 'ipv4')
}

const blockedIpv6 = new BlockList()
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['fc00::', 7],
  ['fec0::', 10],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blockedIpv6.addSubnet(network, prefix, 'ipv6')
}

export interface SafeHttpRequestOptions {
  method?: string
  headers?: IncomingHttpHeaders
  body?: Readable
  signal: AbortSignal
  allowedPrivateHosts?: readonly string[]
}

export async function requestSafeHttpResponse(
  target: URL,
  { method = 'GET', headers = {}, body, signal, allowedPrivateHosts = [] }: SafeHttpRequestOptions,
): Promise<IncomingMessage> {
  validateTarget(target)
  const originalHostname = unbracket(target.hostname)
  const resolved = await resolveSafeHttpAddress(originalHostname, allowedPrivateHosts)

  return new Promise((resolve, reject) => {
    const request = target.protocol === 'https:' ? httpsRequest : httpRequest
    const outgoing = request(
      {
        protocol: target.protocol,
        hostname: resolved.address,
        family: resolved.family,
        port: target.port || undefined,
        path: target.pathname + target.search,
        method,
        headers: { ...headers, host: target.host },
        signal,
        ...(target.protocol === 'https:' && !isIP(originalHostname) ? { servername: originalHostname } : {}),
      },
      resolve,
    )
    outgoing.once('error', reject)
    if (body) {
      pipeline(body, outgoing, (error) => {
        if (error) reject(error)
      })
    } else {
      outgoing.end()
    }
  })
}

export function selectSafeHttpAddress(addresses: readonly LookupAddress[], allowPrivate = false): LookupAddress {
  const hasInvalidAddress = addresses.some(({ address }) => !isIP(address) || address.includes('%'))
  if (
    addresses.length === 0 ||
    hasInvalidAddress ||
    (!allowPrivate && addresses.some(({ address }) => isForbiddenIpAddress(address)))
  ) {
    throw httpError(422, 'Transfer endpoint must resolve only to public network addresses')
  }
  return addresses[0]
}

export function isAllowedPrivateHttpHost(hostname: string, allowedHosts: readonly string[]): boolean {
  const normalizedHostname = normalizeHostname(hostname)
  return allowedHosts.some((allowedHost) => normalizeHostname(allowedHost) === normalizedHostname)
}

export function isForbiddenIpAddress(address: string): boolean {
  if (address.includes('%')) return true
  const family = isIP(address)
  if (family === 4) return blockedIpv4.check(address, 'ipv4')
  if (family !== 6) return true

  const mappedIpv4 = mappedIpv4Address(address)
  if (mappedIpv4) return blockedIpv4.check(mappedIpv4, 'ipv4')
  return blockedIpv6.check(address, 'ipv6')
}

async function resolveSafeHttpAddress(
  hostname: string,
  allowedPrivateHosts: readonly string[],
): Promise<LookupAddress> {
  const family = isIP(hostname)
  const addresses: LookupAddress[] = family
    ? [{ address: hostname, family }]
    : await lookup(hostname, { all: true, verbatim: true })
  const allowPrivate = isAllowedPrivateHttpHost(hostname, allowedPrivateHosts)
  return selectSafeHttpAddress(addresses, allowPrivate)
}

function validateTarget(target: URL): void {
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw httpError(422, 'Only HTTP data endpoints can be accessed')
  }
  if (target.username || target.password) {
    throw httpError(422, 'Transfer endpoints with embedded credentials cannot be accessed')
  }
}

function mappedIpv4Address(address: string): string | null {
  const normalized = address.toLowerCase()
  const dottedMatch = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)
  if (dottedMatch && isIP(dottedMatch[1]) === 4) return dottedMatch[1]

  const [left = '', right = ''] = normalized.split('::')
  if (normalized.split('::').length > 2) return null
  const leftGroups = left ? left.split(':') : []
  const rightGroups = right ? right.split(':') : []
  const missing = 8 - leftGroups.length - rightGroups.length
  if (missing < 0) return null
  const groups = [...leftGroups, ...Array.from({ length: missing }, () => '0'), ...rightGroups]
  if (groups.length !== 8 || groups.slice(0, 5).some((group) => Number.parseInt(group || '0', 16) !== 0)) return null
  if (Number.parseInt(groups[5] || '0', 16) !== 0xffff) return null
  const high = Number.parseInt(groups[6] || '0', 16)
  const low = Number.parseInt(groups[7] || '0', 16)
  if (![high, low].every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffff)) return null
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
}

function unbracket(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

function normalizeHostname(hostname: string): string {
  return unbracket(hostname.trim()).toLowerCase().replace(/\.$/, '')
}
