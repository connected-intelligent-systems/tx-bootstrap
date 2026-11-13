// Chooses the Dataspace Protocol version for a counterparty. Participants
// publish their unversioned DSP base address; the connector discovery API of
// Tractus-X EDC reads the counterparty's /.well-known/dspace-version and returns
// the newest common version with its versioned address.

export const DSP_2025_1 = 'dataspace-protocol-http:2025-1'
export const DSP_0_8 = 'dataspace-protocol-http'

export interface DspParams {
  counterPartyAddress: string
  protocol: string
}

const cache = new Map<string, Promise<DspParams>>()

export function resolveDspParams(
  counterPartyAddress: string,
  counterPartyId?: string,
  protocol?: string,
): Promise<DspParams> {
  if (protocol) return Promise.resolve({ counterPartyAddress, protocol })
  if (/\/2025-1\/?$/.test(counterPartyAddress)) {
    return Promise.resolve({ counterPartyAddress, protocol: DSP_2025_1 })
  }
  // Discovery needs the counterparty's identifier.
  if (!counterPartyId) return Promise.resolve({ counterPartyAddress, protocol: DSP_0_8 })

  const key = `${counterPartyId} ${counterPartyAddress}`
  let params = cache.get(key)
  if (!params) {
    params = discover(counterPartyAddress, counterPartyId)
    cache.set(key, params)
    // A failed discovery is retried on the next request.
    params.then((result) => {
      if (result.protocol === DSP_0_8) cache.delete(key)
    })
  }
  return params
}

async function discover(counterPartyAddress: string, counterPartyId: string): Promise<DspParams> {
  try {
    const response = await fetch('/api/management/v3/connectordiscovery/dspversionparams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        '@context': { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' },
        counterPartyAddress,
        counterPartyId,
      }),
    })
    if (response.ok) {
      const body = await response.json()
      const address = readString(body, 'counterPartyAddress')
      const discovered = readString(body, 'protocol')
      if (address && discovered) return { counterPartyAddress: address, protocol: discovered }
    }
  } catch {
    // Fall back to DSP 0.8, which every Tractus-X connector still serves.
  }
  return { counterPartyAddress, protocol: DSP_0_8 }
}

function readString(body: unknown, name: string): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  const value = record[name] ?? record[`edc:${name}`] ?? record[`https://w3id.org/edc/v0.0.1/ns/${name}`]
  return typeof value === 'string' && value ? value : undefined
}

export function clearDspParamsCache(): void {
  cache.clear()
}
