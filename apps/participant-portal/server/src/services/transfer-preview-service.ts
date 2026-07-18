import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config/index.js'
import { fetchUpstream } from '../lib/http-client.js'
import { fetchPublicHttpPreview } from './public-http-preview.js'

type DataAddress = Record<string, unknown>

const property = (record: DataAddress, name: string): string | undefined => {
  const value =
    record[name] ?? Object.entries(record).find(([key]) => key.endsWith('/' + name) || key.endsWith('#' + name))?.[1]
  return typeof value === 'string' && value ? value : undefined
}

export async function previewHttpPullTransfer(
  request: FastifyRequest<{ Params: { transferId: string } }>,
  reply: FastifyReply,
) {
  const transferId = encodeURIComponent(request.params.transferId)
  const edrResponse = await fetchUpstream(
    new URL(`v3/edrs/${transferId}/dataaddress`, config.edc.managementApiUrl),
    { headers: { accept: 'application/json', 'x-api-key': config.edc.apiKey } },
    { upstreamName: 'EDC' },
  )
  if (!edrResponse.ok) {
    return reply.code(edrResponse.status).send({ error: 'Access details are not available for this transfer.' })
  }

  const dataAddress = (await edrResponse.json()) as DataAddress
  const endpoint = property(dataAddress, 'endpoint')
  const authorization = property(dataAddress, 'authorization')
  if (!endpoint) return reply.code(422).send({ error: 'The transfer does not provide an HTTP endpoint.' })

  const target = new URL(endpoint)
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return reply.code(422).send({ error: 'Only HTTP data endpoints can be previewed.' })
  }

  const preview = await fetchPublicHttpPreview(target, authorization)
  return reply.header('Cache-Control', 'no-store').send({
    ...preview,
  })
}
