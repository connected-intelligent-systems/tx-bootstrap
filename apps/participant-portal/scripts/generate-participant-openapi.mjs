import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from 'prettier'
import { parse } from 'yaml'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const manifestPath = resolve(scriptDirectory, '../server/src/openapi/gateway-operations.json')
const outputPath = resolve(scriptDirectory, '../server/src/openapi/participant-api.openapi.json')
const upstreamUrl =
  'https://eclipse-tractusx.github.io/tractusx-edc/openapi/control-plane-api/0.12.1/control-plane.yaml'

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const upstreamResponse = await fetch(upstreamUrl)
if (!upstreamResponse.ok) {
  throw new Error(`Could not download Tractus-X EDC OpenAPI: ${upstreamResponse.status} ${upstreamResponse.statusText}`)
}
const upstream = parse(await upstreamResponse.text())
if (upstream.info?.version !== '0.12.1') {
  throw new Error(`Expected Tractus-X EDC OpenAPI 0.12.1, received ${upstream.info?.version ?? 'unknown'}`)
}

const paths = {}
for (const operation of manifest.operations.filter(({ path }) => path.startsWith('/api/management/'))) {
  const sourcePath = operation.path.slice('/api/management'.length)
  const sourceOperation = upstream.paths?.[sourcePath]?.[operation.method.toLowerCase()]
  if (!sourceOperation) {
    throw new Error(`Upstream OpenAPI does not define ${operation.method} ${sourcePath}`)
  }

  const documentedOperation = structuredClone(sourceOperation)
  documentedOperation.security = [{ apiClientToken: [] }]
  documentedOperation['x-required-scope'] = operation.scope
  documentedOperation.responses = addGatewayResponses(documentedOperation.responses)
  ;(paths[operation.path] ??= {})[operation.method.toLowerCase()] = documentedOperation
}

const referencedComponents = collectReferencedComponents(paths, upstream.components ?? {})
Object.assign(paths, federatedCatalogPaths())

const scopes = [...new Set(manifest.operations.map(({ scope }) => scope))]
const document = {
  openapi: '3.0.1',
  info: {
    title: 'tx-bootstrap Participant API',
    version: '1.0.0',
    description:
      'Participant-facing API for scoped API clients. It exposes only the operations listed here; other native EDC management operations are rejected by the gateway.',
    license: upstream.info.license,
  },
  externalDocs: {
    description: 'Tractus-X EDC 0.12.1 control-plane API documentation',
    url: 'https://eclipse-tractusx.github.io/tractusx-edc/openapi/control-plane-api/0.12.1/',
  },
  servers: [{ url: '/', description: 'This participant' }],
  tags: [
    { name: 'Federated Catalog', description: 'Search the participant-local catalog cache.' },
    { name: 'Federated Catalog SPARQL', description: 'Run bounded, read-only semantic queries.' },
  ],
  paths,
  components: {
    ...referencedComponents,
    schemas: {
      ...(referencedComponents.schemas ?? {}),
      ...federatedCatalogSchemas(),
      GatewayError: {
        type: 'object',
        required: ['error'],
        properties: {
          error: { type: 'string' },
          details: { nullable: true },
        },
      },
    },
    securitySchemes: {
      apiClientToken: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'txb_',
        description:
          'Opaque API-client token created in the participant portal. Each operation also declares its required scope in x-required-scope.',
      },
    },
  },
  'x-api-client-scopes': scopes,
  'x-upstream': {
    distribution: 'Tractus-X EDC',
    distributionVersion: '0.12.1',
    eclipseEdcManagementApiVersion: '3.1.4',
    openApi: upstreamUrl,
  },
}

await writeFile(outputPath, await format(JSON.stringify(document), { parser: 'json' }))
console.log(`Wrote ${outputPath}`)

function addGatewayResponses(responses = {}) {
  return {
    ...responses,
    401: gatewayErrorResponse('A valid API-client token is required.'),
    403: gatewayErrorResponse('The API client does not have the required scope.'),
    404: gatewayErrorResponse('The operation or resource is not exposed by this participant.'),
  }
}

function gatewayErrorResponse(description) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/GatewayError' },
      },
    },
  }
}

function protectedOperation(scope, operation) {
  return {
    ...operation,
    security: [{ apiClientToken: [] }],
    'x-required-scope': scope,
    responses: addGatewayResponses(operation.responses),
  }
}

function federatedCatalogPaths() {
  const sparqlResponses = {
    200: {
      description: 'SPARQL query result. The representation depends on the query form and Accept header.',
      content: {
        'application/sparql-results+json': { schema: { type: 'object', additionalProperties: true } },
        'text/csv': { schema: { type: 'string' } },
        'text/tab-separated-values': { schema: { type: 'string' } },
        'text/turtle': { schema: { type: 'string' } },
        'application/ld+json': { schema: { type: 'object', additionalProperties: true } },
        'application/n-triples': { schema: { type: 'string' } },
      },
    },
    400: gatewayErrorResponse('The SPARQL query is missing, invalid, unbounded, or contains a forbidden operation.'),
    413: gatewayErrorResponse('The query or serialized result exceeds the configured limit.'),
    503: gatewayErrorResponse('Another SPARQL query is still occupying this replica.'),
    504: gatewayErrorResponse('The 30-second response deadline was exceeded.'),
  }
  const sparqlDescription =
    'Runs SELECT, ASK, CONSTRUCT, or DESCRIBE against the participant-local snapshots. SPARQL Update and SERVICE are rejected. Result-producing queries require an outer LIMIT no greater than 1000. Query text is limited to 64 KiB and serialized output to 5 MiB.'

  return {
    '/api/federated-catalog/v1/datasets': {
      get: protectedOperation('federated-catalog:read', {
        tags: ['Federated Catalog'],
        summary: 'Search cached datasets',
        operationId: 'searchFederatedCatalogDatasets',
        parameters: [
          queryParameter(
            'q',
            'Case-insensitive substring search over title, description, abstract, keywords, and theme.',
            {
              type: 'string',
              maxLength: 200,
            },
          ),
          queryParameter('participantBpn', 'Filter by participant BPN.', { type: 'string' }),
          queryParameter('theme', 'Filter by dataset theme/category.', { type: 'string' }),
          queryParameter('contentType', 'Filter by dataset content type.', { type: 'string' }),
          queryParameter('offset', 'Zero-based result offset.', { type: 'integer', minimum: 0, default: 0 }),
          queryParameter('limit', 'Maximum number of results.', {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
          }),
        ],
        responses: {
          200: jsonResponse('A page of matching datasets.', '#/components/schemas/FederatedDatasetPage'),
        },
      }),
    },
    '/api/federated-catalog/v1/datasets/{entryId}': {
      get: protectedOperation('federated-catalog:read', {
        tags: ['Federated Catalog'],
        summary: 'Get one cached dataset',
        operationId: 'getFederatedCatalogDataset',
        parameters: [pathParameter('entryId', 'Stable federated-catalog entry identifier.')],
        responses: {
          200: jsonResponse(
            'The cached dataset and negotiation metadata.',
            '#/components/schemas/FederatedDatasetEntry',
          ),
        },
      }),
    },
    '/api/federated-catalog/v1/participants': {
      get: protectedOperation('federated-catalog:read', {
        tags: ['Federated Catalog'],
        summary: 'List participant crawl state',
        operationId: 'listFederatedCatalogParticipants',
        responses: {
          200: jsonResponse('Crawl state for known participants.', '#/components/schemas/FederatedParticipantPage'),
        },
      }),
    },
    '/api/federated-catalog/v1/sparql': {
      get: protectedOperation('federated-catalog:sparql', {
        tags: ['Federated Catalog SPARQL'],
        summary: 'Execute a read-only SPARQL query',
        description: sparqlDescription,
        operationId: 'queryFederatedCatalogSparqlGet',
        parameters: [
          {
            name: 'query',
            in: 'query',
            required: true,
            description: 'SPARQL query text.',
            schema: { type: 'string', maxLength: 65536 },
          },
        ],
        responses: sparqlResponses,
      }),
      post: protectedOperation('federated-catalog:sparql', {
        tags: ['Federated Catalog SPARQL'],
        summary: 'Execute a read-only SPARQL query',
        description: sparqlDescription,
        operationId: 'queryFederatedCatalogSparqlPost',
        requestBody: {
          required: true,
          content: {
            'application/sparql-query': {
              schema: { type: 'string', maxLength: 65536 },
            },
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                required: ['query'],
                properties: { query: { type: 'string', maxLength: 65536 } },
              },
            },
          },
        },
        responses: sparqlResponses,
      }),
    },
  }
}

function queryParameter(name, description, schema) {
  return { name, in: 'query', required: false, description, schema }
}

function pathParameter(name, description) {
  return { name, in: 'path', required: true, description, schema: { type: 'string' } }
}

function jsonResponse(description, schemaRef) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: schemaRef },
      },
    },
  }
}

function federatedCatalogSchemas() {
  const nullableDateTime = { type: 'string', format: 'date-time', nullable: true }
  return {
    FederatedParticipant: {
      type: 'object',
      required: ['name', 'bpn', 'did', 'dspEndpoint'],
      properties: {
        name: { type: 'string' },
        bpn: { type: 'string' },
        did: { type: 'string' },
        dspEndpoint: { type: 'string', format: 'uri' },
      },
    },
    JsonLdDocument: {
      type: 'object',
      description: 'Native compacted JSON-LD document. Additional semantic properties are preserved.',
      additionalProperties: true,
    },
    FederatedDatasetEntry: {
      type: 'object',
      required: [
        'id',
        'datasetId',
        'participant',
        'counterPartyAddress',
        'counterPartyId',
        'crawledAt',
        'stale',
        'dataset',
      ],
      properties: {
        id: { type: 'string' },
        datasetId: { type: 'string' },
        participant: { $ref: '#/components/schemas/FederatedParticipant' },
        counterPartyAddress: { type: 'string', format: 'uri' },
        counterPartyId: { type: 'string' },
        crawledAt: { type: 'string', format: 'date-time' },
        stale: { type: 'boolean' },
        dataset: { $ref: '#/components/schemas/JsonLdDocument' },
      },
    },
    FederatedDatasetPage: {
      type: 'object',
      required: ['items', 'total', 'offset', 'limit'],
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/FederatedDatasetEntry' } },
        total: { type: 'integer', minimum: 0 },
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
    FederatedParticipantStatus: {
      type: 'object',
      required: ['participant', 'state', 'datasetCount', 'active', 'stale'],
      properties: {
        participant: { $ref: '#/components/schemas/FederatedParticipant' },
        state: { type: 'string', enum: ['pending', 'fresh', 'degraded', 'error', 'inactive'] },
        datasetCount: { type: 'integer', minimum: 0 },
        lastAttemptAt: nullableDateTime,
        lastSuccessAt: nullableDateTime,
        inactiveSince: nullableDateTime,
        lastError: { type: 'string', nullable: true, description: 'Sanitized crawl error.' },
        active: { type: 'boolean' },
        stale: { type: 'boolean' },
      },
    },
    FederatedParticipantPage: {
      type: 'object',
      required: ['items'],
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/FederatedParticipantStatus' } },
      },
    },
  }
}

function collectReferencedComponents(root, sourceComponents) {
  const collected = {}
  const pending = []
  const seen = new Set()

  scanReferences(root, pending)
  while (pending.length > 0) {
    const reference = pending.shift()
    if (seen.has(reference)) continue
    seen.add(reference)

    const match = reference.match(/^#\/components\/([^/]+)\/([^/]+)$/)
    if (!match) continue
    const [, section, encodedName] = match
    const name = encodedName.replaceAll('~1', '/').replaceAll('~0', '~')
    const component = sourceComponents[section]?.[name]
    if (reference === '#/components/schemas/GatewayError') continue
    if (!component) throw new Error(`Upstream OpenAPI is missing referenced component ${reference}`)

    ;(collected[section] ??= {})[name] = structuredClone(component)
    scanReferences(component, pending)
  }
  return collected
}

function scanReferences(value, references) {
  if (Array.isArray(value)) {
    for (const item of value) scanReferences(item, references)
    return
  }
  if (!value || typeof value !== 'object') return
  if (typeof value.$ref === 'string') references.push(value.$ref)
  for (const child of Object.values(value)) scanReferences(child, references)
}
