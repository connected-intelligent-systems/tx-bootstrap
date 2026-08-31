import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config/index.js'
import { fetchUpstream } from '../lib/http-client.js'
import { fetchPublicHttpDownload, fetchPublicHttpPreview } from './public-http-preview.js'

type DataAddress = Record<string, unknown>

const property = (record: DataAddress, name: string): string | undefined => {
  const value =
    record[name] ?? Object.entries(record).find(([key]) => key.endsWith('/' + name) || key.endsWith('#' + name))?.[1]
  return typeof value === 'string' && value ? value : undefined
}

type TransferEndpoint = { target: URL; authorization?: string }
type TransferEndpointError = { status: number; error: string }

export async function previewHttpPullTransfer(
  request: FastifyRequest<{ Params: { transferId: string } }>,
  reply: FastifyReply,
) {
  const resolved = await resolveHttpPullTransfer(request.params.transferId)
  if ('error' in resolved) return reply.code(resolved.status).send({ error: resolved.error })

  const preview = await fetchPublicHttpPreview(resolved.target, resolved.authorization)
  return reply.header('Cache-Control', 'no-store').send({
    ...preview,
  })
}

export async function downloadHttpPullTransfer(
  request: FastifyRequest<{ Params: { transferId: string } }>,
  reply: FastifyReply,
) {
  const resolved = await resolveHttpPullTransfer(request.params.transferId)
  if ('error' in resolved) return reply.code(resolved.status).send({ error: resolved.error })

  const response = await fetchPublicHttpDownload(resolved.target, resolved.authorization)
  const status = validStatus(response.statusCode) ? response.statusCode : 502
  const contentType = firstHeader(response.headers['content-type']) || 'application/octet-stream'
  const contentLength = firstHeader(response.headers['content-length'])
  const upstreamDisposition = firstHeader(response.headers['content-disposition'])

  reply.code(status).header('Cache-Control', 'no-store').header('Content-Type', contentType)
  if (contentLength) reply.header('Content-Length', contentLength)
  if (status >= 200 && status < 300) {
    reply.header(
      'Content-Disposition',
      attachmentDisposition(upstreamDisposition, request.params.transferId, contentType),
    )
  }
  return reply.send(response)
}

async function resolveHttpPullTransfer(transferIdValue: string): Promise<TransferEndpoint | TransferEndpointError> {
  const transferId = encodeURIComponent(transferIdValue)
  const edrResponse = await fetchUpstream(
    new URL(`v3/edrs/${transferId}/dataaddress`, config.edc.managementApiUrl),
    { headers: { accept: 'application/json', 'x-api-key': config.edc.apiKey } },
    { upstreamName: 'EDC' },
  )
  if (!edrResponse.ok) {
    return { status: edrResponse.status, error: 'Access details are not available for this transfer.' }
  }

  const dataAddress = (await edrResponse.json()) as DataAddress
  const endpoint = property(dataAddress, 'endpoint')
  const authorization = property(dataAddress, 'authorization')
  if (!endpoint) return { status: 422, error: 'The transfer does not provide an HTTP endpoint.' }

  let target: URL
  try {
    target = new URL(endpoint)
  } catch {
    return { status: 422, error: 'The transfer does not provide a valid HTTP endpoint.' }
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { status: 422, error: 'Only HTTP data endpoints can be accessed.' }
  }

  return { target, authorization }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function validStatus(status: number | undefined): status is number {
  return Number.isInteger(status) && Number(status) >= 200 && Number(status) <= 599
}

function attachmentDisposition(upstream: string | undefined, transferId: string, contentType: string): string {
  if (upstream && /^\s*attachment(?:\s*;|\s*$)/i.test(upstream)) return upstream
  const safeId = transferId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'transfer-data'
  return `attachment; filename="${safeId}${fileExtension(contentType)}"`
}

function fileExtension(contentType: string): string {
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase()
  if (mediaType === 'application/json' || mediaType.endsWith('+json')) return '.json'
  if (mediaType === 'text/csv') return '.csv'
  if (mediaType === 'application/zip') return '.zip'
  if (mediaType === 'application/pdf') return '.pdf'
  if (mediaType === 'text/plain') return '.txt'
  if (mediaType === 'application/xml' || mediaType === 'text/xml' || mediaType.endsWith('+xml')) return '.xml'
  return ''
}
