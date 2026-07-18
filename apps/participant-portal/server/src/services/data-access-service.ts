import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config/index.js'
import { fetchUpstream } from '../lib/http-client.js'

const EDC_CONTEXT = { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' }
const UPSTREAM_PAGE_SIZE = 100
const NEGOTIATION_PENDING_STATES = new Set([
  'INITIAL',
  'REQUESTING',
  'REQUESTED',
  'OFFERING',
  'OFFERED',
  'ACCEPTING',
  'ACCEPTED',
  'AGREEING',
  'AGREED',
  'VERIFYING',
  'VERIFIED',
  'FINALIZING',
])
const NEGOTIATION_ISSUE_STATES = new Set(['DECLINING', 'DECLINED', 'TERMINATING', 'TERMINATED'])
const TRANSFER_ISSUE_STATES = new Set(['FAILED', 'ERROR', 'TERMINATED'])
const RELATED_RECORD_TYPES = new Set(['negotiations', 'agreements', 'transfers'])

type DataAccessQuery = { offset?: string; limit?: string; status?: string }
type DataAccessParams = { lifecycleId: string }
type RelatedParams = DataAccessParams & { relation: string }
type JsonRecord = Record<string, unknown>
type FilterExpression = { operandLeft: string; operator: string; operandRight: unknown }
type LifecycleScope = { providerId: string; assetId: string }

interface LifecycleData {
  negotiations: JsonRecord[]
  agreements: JsonRecord[]
  transfers: JsonRecord[]
  retiredIds: Set<string>
}

interface LifecycleRecord {
  id: string
  assetId: string
  providerId: string
  status: 'pending' | 'active' | 'issues'
  updatedAt?: string
  errorDetail?: string
  negotiationState?: string
  latestTransferState?: string
  counterPartyAddress?: string
  agreementId?: string
  negotiationIds: string[]
  agreementCount: number
  requestCount: number
  transferCount: number
  canUseData: boolean
}

export async function getDataAccessLifecycles(
  request: FastifyRequest<{ Querystring: DataAccessQuery }>,
  reply: FastifyReply,
) {
  const { offset, limit } = pagination(request.query)
  const status = ['pending', 'active', 'issues'].includes(request.query.status || '') ? request.query.status : undefined
  const data = await loadLifecycleData()
  const lifecycles = buildLifecycles(data)
    .filter((item) => !status || item.status === status)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))

  return reply.send({ data: lifecycles.slice(offset, offset + limit), total: lifecycles.length })
}

export async function getDataAccessLifecycle(
  request: FastifyRequest<{ Params: DataAccessParams }>,
  reply: FastifyReply,
) {
  const scope = parseLifecycleId(request.params.lifecycleId)
  if (!scope) return reply.code(400).send({ message: 'Invalid data access lifecycle ID' })
  const lifecycle = buildLifecycles(await loadLifecycleData(scope))[0]
  if (!lifecycle) return reply.code(404).send({ message: 'Data access lifecycle not found' })
  return reply.send({ data: lifecycle })
}

export async function getDataAccessRelatedRecords(
  request: FastifyRequest<{ Params: RelatedParams; Querystring: DataAccessQuery }>,
  reply: FastifyReply,
) {
  const scope = parseLifecycleId(request.params.lifecycleId)
  if (!scope) return reply.code(400).send({ message: 'Invalid data access lifecycle ID' })
  const relation = request.params.relation
  if (!RELATED_RECORD_TYPES.has(relation)) return reply.code(404).send({ message: 'Unknown lifecycle relation' })
  const { offset, limit } = pagination(request.query)
  const data = await loadLifecycleData(scope, {
    agreements: relation !== 'negotiations',
    transfers: relation === 'transfers',
    retirements: false,
  })
  const records = relationRecords(data, relation).sort((left, right) =>
    String(right.updatedAt || right.createdAt || right.stateTimestamp || right.contractSigningDate).localeCompare(
      String(left.updatedAt || left.createdAt || left.stateTimestamp || left.contractSigningDate),
    ),
  )
  return reply.send({ data: records.slice(offset, offset + limit), total: records.length })
}

async function loadLifecycleData(
  scope?: LifecycleScope,
  include = { agreements: true, transfers: true, retirements: true },
): Promise<LifecycleData> {
  const negotiationFilters = [filter('type', '=', 'CONSUMER')]
  if (scope) {
    negotiationFilters.push(filter('counterPartyId', '=', scope.providerId))
  }
  const negotiations = (await queryAll('v3/contractnegotiations/request', negotiationFilters)).filter(
    (entry) =>
      readString(entry, 'type') === 'CONSUMER' &&
      (!scope ||
        (readString(entry, 'counterPartyId') === scope.providerId && readString(entry, 'assetId') === scope.assetId)),
  )
  const agreementIds = uniqueStrings(negotiations.map((entry) => readString(entry, 'contractAgreementId')))
  const agreements =
    include.agreements && agreementIds.length
      ? await queryAll('v3/contractagreements/request', [filter('id', 'in', agreementIds)])
      : []
  const transfers =
    include.transfers && agreementIds.length
      ? await queryAll('v3/transferprocesses/request', [filter('contractId', 'in', agreementIds)])
      : []
  const retirements =
    include.retirements && agreementIds.length
      ? await queryAll('v3/contractagreements/retirements/request', [filter('agreementId', 'in', agreementIds)])
      : []
  const retiredIds = new Set<string>(
    retirements.map((entry) => readString(entry, 'agreementId')).filter((value): value is string => Boolean(value)),
  )
  return { negotiations, agreements, transfers, retiredIds }
}

function buildLifecycles({ negotiations, agreements, transfers, retiredIds }: LifecycleData): LifecycleRecord[] {
  const groups = new Map<string, JsonRecord[]>()
  for (const negotiation of negotiations) {
    const assetId = readString(negotiation, 'assetId')
    const providerId = readString(negotiation, 'counterPartyId')
    if (!assetId || !providerId) continue
    const key = lifecycleId(providerId, assetId)
    groups.set(key, [...(groups.get(key) || []), negotiation])
  }

  return [...groups.entries()].map(([id, requests]) => {
    const sortedRequests = [...requests].sort((left, right) => timestamp(right).localeCompare(timestamp(left)))
    const latestRequest = sortedRequests[0]
    const assetId = readString(latestRequest, 'assetId') || ''
    const providerId = readString(latestRequest, 'counterPartyId') || ''
    const requestAgreementIds = new Set(
      sortedRequests.map((item) => readString(item, 'contractAgreementId')).filter((value): value is string => !!value),
    )
    const relatedAgreements = agreements.filter((item) => requestAgreementIds.has(readString(item, '@id') || ''))
    const relatedAgreementIds = new Set(
      relatedAgreements.map((item) => readString(item, '@id')).filter((value): value is string => !!value),
    )
    const relatedTransfers = transfers.filter((item) => relatedAgreementIds.has(readString(item, 'contractId') || ''))
    const usableAgreements = relatedAgreements.filter((item) => {
      const id = readString(item, '@id')
      return Boolean(id && !retiredIds.has(id))
    })
    const latestAgreement = latest(usableAgreements)
    const latestTransfer = latest(relatedTransfers)
    const negotiationState = readString(latestRequest, 'state')
    const latestTransferState = readString(latestTransfer, 'state')
    const agreementId = readString(latestAgreement, '@id')
    const allAgreementsRetired = relatedAgreements.length > 0 && usableAgreements.length === 0
    const errorDetail = readString(latestRequest, 'errorDetail') || readString(latestTransfer, 'errorDetail')
    const hasIssue =
      Boolean(errorDetail) ||
      allAgreementsRetired ||
      NEGOTIATION_ISSUE_STATES.has(negotiationState || '') ||
      TRANSFER_ISSUE_STATES.has(latestTransferState || '')
    const status: LifecycleRecord['status'] = agreementId
      ? 'active'
      : hasIssue
        ? 'issues'
        : NEGOTIATION_PENDING_STATES.has(negotiationState || '')
          ? 'pending'
          : 'issues'
    const updatedAt = [...sortedRequests, ...relatedAgreements, ...relatedTransfers]
      .map(timestamp)
      .filter(Boolean)
      .sort()
      .at(-1)

    return {
      id,
      assetId,
      providerId,
      status,
      updatedAt,
      errorDetail,
      negotiationState,
      latestTransferState,
      counterPartyAddress: readString(latestRequest, 'counterPartyAddress'),
      agreementId,
      negotiationIds: sortedRequests.map((item) => readString(item, '@id')).filter((value): value is string => !!value),
      agreementCount: relatedAgreements.length,
      requestCount: sortedRequests.length,
      transferCount: relatedTransfers.length,
      canUseData: Boolean(agreementId && readString(latestRequest, 'counterPartyAddress')),
    }
  })
}

function relationRecords(data: LifecycleData, relation: string): JsonRecord[] {
  if (relation === 'negotiations') return data.negotiations.map(normalizeNegotiation)
  if (relation === 'agreements') return data.agreements.map(normalizeAgreement)
  return data.transfers.map(normalizeTransfer)
}

function normalizeNegotiation(record: JsonRecord): JsonRecord {
  return compact({
    id: readString(record, '@id'),
    type: readString(record, 'type') || 'CONSUMER',
    state: readString(record, 'state') || 'UNKNOWN',
    protocol: readString(record, 'protocol') || 'dataspace-protocol-http',
    counterPartyId: readString(record, 'counterPartyId'),
    counterPartyAddress: readString(record, 'counterPartyAddress'),
    contractAgreementId: readString(record, 'contractAgreementId'),
    datasetId: readString(record, 'assetId'),
    assetId: readString(record, 'assetId'),
    errorDetail: readString(record, 'errorDetail'),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })
}

function normalizeAgreement(record: JsonRecord): JsonRecord {
  return compact({
    id: readString(record, '@id'),
    type: readString(record, '@type') || 'ContractAgreement',
    providerId: readString(record, 'providerId'),
    consumerId: readString(record, 'consumerId'),
    assetId: readString(record, 'assetId'),
    contractSigningDate: timestamp(record),
    policy: { id: '', type: 'Policy' },
  })
}

function normalizeTransfer(record: JsonRecord): JsonRecord {
  return compact({
    id: readString(record, '@id'),
    jsonLdType: readString(record, '@type') || 'TransferProcess',
    state: readString(record, 'state') || 'UNKNOWN',
    stateTimestamp: normalizeDate(record.stateTimestamp) || timestamp(record),
    transferDirection: readString(record, 'type') || 'CONSUMER',
    transferType: readString(record, 'transferType'),
    contractId: readString(record, 'contractId'),
    assetId: readString(record, 'assetId'),
    errorDetail: readString(record, 'errorDetail'),
    createdAt: normalizeDate(record.createdAt),
    updatedAt: normalizeDate(record.updatedAt),
  })
}

async function queryAll(path: string, filterExpression: FilterExpression[]): Promise<JsonRecord[]> {
  const records: JsonRecord[] = []
  let offset = 0
  while (true) {
    const response = await fetchUpstream(
      new URL(path, config.edc.managementApiUrl),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': config.edc.apiKey },
        body: JSON.stringify({
          '@context': EDC_CONTEXT,
          '@type': 'QuerySpec',
          offset,
          limit: UPSTREAM_PAGE_SIZE,
          filterExpression,
        }),
      },
      { upstreamName: 'EDC' },
    )
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`Failed to query ${path} (${response.status}): ${detail}`)
    }
    const page: unknown = await response.json()
    if (!Array.isArray(page)) throw new Error(`${path} returned an invalid response`)
    const pageRecords = page.filter(isRecord)
    records.push(...pageRecords)
    if (pageRecords.length < UPSTREAM_PAGE_SIZE) return records
    offset += UPSTREAM_PAGE_SIZE
  }
}

const lifecycleId = (providerId: string, assetId: string) => `${providerId}|${assetId}`

function parseLifecycleId(value: string): LifecycleScope | undefined {
  const separator = value.indexOf('|')
  if (separator < 1 || separator === value.length - 1) return undefined
  return { providerId: value.slice(0, separator), assetId: value.slice(separator + 1) }
}

const filter = (operandLeft: string, operator: string, operandRight: unknown): FilterExpression => ({
  operandLeft,
  operator,
  operandRight,
})

const latest = (records: JsonRecord[]) =>
  [...records].sort((left, right) => timestamp(right).localeCompare(timestamp(left)))[0]

function timestamp(record?: JsonRecord): string {
  if (!record) return ''
  return (
    normalizeDate(record.updatedAt || record.createdAt || record.stateTimestamp || record.contractSigningDate) || ''
  )
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value !== 'number') return undefined
  const milliseconds = value < 10_000_000_000 ? value * 1000 : value
  return new Date(milliseconds).toISOString()
}

function readString(record: JsonRecord | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

function compact(record: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => !!value))]
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pagination(query: DataAccessQuery) {
  return {
    offset: toNonNegativeInteger(query.offset, 0),
    limit: Math.min(toPositiveInteger(query.limit, 10), 100),
  }
}

function toNonNegativeInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
