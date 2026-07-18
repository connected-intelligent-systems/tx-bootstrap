import type { FastifyReply, FastifyRequest } from 'fastify'

type ConvertBody = { thingDescription?: unknown }
type Converter = (thingDescription: Record<string, unknown>) => Promise<{ json: unknown }>

export async function convertThingDescription(request: FastifyRequest<{ Body: ConvertBody }>, reply: FastifyReply) {
  const thingDescription = parseThingDescription(request.body?.thingDescription)
  if (!thingDescription) {
    return reply.code(400).send({ message: 'thingDescription must be a JSON object' })
  }

  try {
    const module = await import('@thingweb/open-api-converter')
    const convert = module.default as Converter
    const result = await convert(thingDescription)
    return reply.send({ data: result.json })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return reply.code(422).send({ message: `Thing Description conversion failed: ${message}` })
  }
}

function parseThingDescription(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return isRecord(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return isRecord(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
