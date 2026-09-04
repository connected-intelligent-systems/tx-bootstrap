import type { FastifyReply, FastifyRequest } from 'fastify'
import { resolveHttpEndpointDataReference } from './edr-service.js'
import { fetchPublicHttpDownload, fetchPublicHttpPreview } from './public-http-preview.js'

export async function previewHttpPullTransfer(
  request: FastifyRequest<{ Params: { transferId: string } }>,
  reply: FastifyReply,
) {
  const resolved = await resolveHttpEndpointDataReference(request.params.transferId)

  const preview = await fetchPublicHttpPreview(resolved.endpoint, resolved.authorization)
  return reply.header('Cache-Control', 'no-store').send({
    ...preview,
  })
}

export async function downloadHttpPullTransfer(
  request: FastifyRequest<{ Params: { transferId: string } }>,
  reply: FastifyReply,
) {
  const resolved = await resolveHttpEndpointDataReference(request.params.transferId)

  const response = await fetchPublicHttpDownload(resolved.endpoint, resolved.authorization)
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
