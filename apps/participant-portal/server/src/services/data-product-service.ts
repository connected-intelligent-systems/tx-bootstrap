import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config/index.js'
import { fetchUpstream } from '../lib/http-client.js'

const EDC_CONTEXT = { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' }
const UPSTREAM_PAGE_SIZE = 100

type DataProductParams = { assetId: string }
type PaginationQuery = { offset?: string; limit?: string }
type JsonLdNegotiation = Record<string, unknown>

export async function getDataProductNegotiations(
  request: FastifyRequest<{ Params: DataProductParams; Querystring: PaginationQuery }>,
  reply: FastifyReply,
) {
  const assetId = request.params.assetId
  const offset = toNonNegativeInteger(request.query.offset, 0)
  const limit = Math.min(toNonNegativeInteger(request.query.limit, 100), 100)
  const negotiations = (await fetchAllNegotiations()).filter((entry) => getNegotiationAssetId(entry) === assetId)

  return reply.send({
    data: negotiations.slice(offset, offset + limit),
    total: negotiations.length,
  })
}

async function fetchAllNegotiations(): Promise<JsonLdNegotiation[]> {
  const negotiations: JsonLdNegotiation[] = []
  let offset = 0

  while (true) {
    const response = await fetchUpstream(
      new URL('v3/contractnegotiations/request', config.edc.managementApiUrl),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.edc.apiKey,
        },
        body: JSON.stringify({
          '@context': EDC_CONTEXT,
          '@type': 'QuerySpec',
          offset,
          limit: UPSTREAM_PAGE_SIZE,
          filterExpression: [],
        }),
      },
      { upstreamName: 'EDC' },
    )
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`Failed to query contract negotiations (${response.status}): ${detail}`)
    }

    const page: unknown = await response.json()
    if (!Array.isArray(page)) throw new Error('Contract negotiation query returned an invalid response')
    const records = page.filter(isRecord)
    negotiations.push(...records)
    if (records.length < UPSTREAM_PAGE_SIZE) return negotiations
    offset += UPSTREAM_PAGE_SIZE
  }
}

function getNegotiationAssetId(entry: JsonLdNegotiation): string | undefined {
  const policy = isRecord(entry.policy) ? entry.policy : undefined
  const odrlPolicy = isRecord(entry['odrl:policy']) ? entry['odrl:policy'] : undefined
  const candidates = [
    entry.assetId,
    entry['edc:assetId'],
    entry['https://w3id.org/edc/v0.0.1/ns/assetId'],
    policy?.target,
    odrlPolicy?.['odrl:target'],
  ]
  return candidates.find((value): value is string => typeof value === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toNonNegativeInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}
