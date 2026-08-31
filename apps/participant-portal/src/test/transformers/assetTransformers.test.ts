import { describe, it, expect } from 'vitest'
import { parseAssetFromJsonLd, serializeAssetToJsonLd } from '../../dataProvider/resources/asset'

describe('Asset Transformers', () => {
  const sampleJsonLdAsset = {
    '@id': 'asset-123',
    properties: {
      'dct:title': 'Test Asset',
      'dct:abstract': 'Test abstract',
      'dcat:mediaType': 'application/json',
      'dcat:keyword': ['data', 'test'],
    },
    dataAddress: {
      type: 'HttpData',
      baseUrl: 'https://example.com/api',
    },
  }

  it('should lift asset from JSON-LD format', async () => {
    const result = await parseAssetFromJsonLd(sampleJsonLdAsset)

    expect(result.id).toBe('asset-123')
    expect(result.title).toBe('Test Asset')
    expect(result.abstract).toBe('Test abstract')
    expect(result.mediaType).toBe('application/json')
    expect(Array.isArray(result.keywords)).toBe(true)
  })

  it('should serialize asset to JSON-LD format', async () => {
    const assetData = {
      id: 'asset-abc',
      title: 'Test Asset',
      abstract: 'Test abstract',
      mediaType: 'application/json',
    }

    const result = await serializeAssetToJsonLd(assetData)

    expect(result).toHaveProperty('@id', 'asset-abc')
    expect(result.properties['dct:title']).toBe('Test Asset')
    expect(result.properties['dct:abstract']).toBe('Test abstract')
    expect(result.properties['dcat:mediaType']).toBe('application/json')
  })

  it('should persist an endpoint-neutral API description as a JSON-LD literal', async () => {
    const result = await serializeAssetToJsonLd({
      id: 'weather-api',
      title: 'Weather API',
      abstract: 'Forecast data',
      apiDescription: {
        openapi: '3.1.0',
        info: { title: 'Weather', version: '1.0.0' },
        servers: [{ url: 'https://evil.example' }],
        paths: { '/forecast': { get: { responses: { 200: { description: 'ok' } } } } },
      },
    })

    const stored = JSON.parse(result.properties['txb:apiDescription'])
    expect(stored).toMatchObject({ openapi: '3.1.0' })
    expect(stored).not.toHaveProperty('servers')

    const parsed = await parseAssetFromJsonLd({
      '@id': 'weather-api',
      properties: {
        'dct:title': 'Weather API',
        'dct:abstract': 'Forecast data',
        'txb:apiDescription': result.properties['txb:apiDescription'],
      },
    })
    expect(parsed.apiDescription).toEqual(stored)
  })

  it('should expose EDC custom headers as editable form rows', async () => {
    const result = await parseAssetFromJsonLd({
      ...sampleJsonLdAsset,
      dataAddress: {
        type: 'HttpData',
        baseUrl: 'https://example.com/a2a',
        authKey: 'X-API-Key',
        authCode: 'secret',
        'header:Accept': 'application/json',
        'header:A2A-Version': '0.3.0',
      },
    })

    expect(result.dataAddress).toMatchObject({
      authKey: 'X-API-Key',
      authCode: 'secret',
      'header:Accept': 'application/json',
      headers: [{ name: 'A2A-Version', value: '0.3.0' }],
    })
  })

  it('should serialize credentials and custom headers using EDC data address properties', async () => {
    const result = await serializeAssetToJsonLd({
      id: 'a2a-agent',
      title: 'A2A Agent',
      abstract: 'An agent endpoint',
      dataAddress: {
        type: 'HttpData',
        baseUrl: 'https://example.com/a2a',
        authKey: 'X-API-Key',
        authCode: 'secret',
        'header:Accept': 'application/json',
        headers: [
          { name: 'A2A-Version', value: '0.3.0' },
          { name: 'header:X-Custom', value: 'custom-value' },
          { name: 'Accept', value: 'ignored-in-favour-of-the-dedicated-field' },
        ],
        proxyPath: true,
      },
    })

    expect(result.dataAddress).toEqual({
      type: 'HttpData',
      baseUrl: 'https://example.com/a2a',
      authKey: 'X-API-Key',
      authCode: 'secret',
      'header:Accept': 'application/json',
      'header:A2A-Version': '0.3.0',
      'header:X-Custom': 'custom-value',
      proxyPath: 'true',
    })
    expect(result.dataAddress).not.toHaveProperty('headers')
  })

  it('should preserve ProxyHttpData and its HTTP properties', async () => {
    const parsed = await parseAssetFromJsonLd({
      ...sampleJsonLdAsset,
      dataAddress: {
        type: 'ProxyHttpData',
        baseUrl: 'https://example.com/orders',
        proxyPath: 'true',
        proxyQueryParams: 'false',
        proxyMethod: 'false',
        proxyBody: 'true',
        'header:Accept': 'application/json',
        'header:X-Tenant': 'tenant-1',
      },
    })

    expect(parsed.dataAddress).toMatchObject({
      type: 'ProxyHttpData',
      baseUrl: 'https://example.com/orders',
      proxyPath: true,
      proxyQueryParams: false,
      proxyMethod: false,
      proxyBody: true,
      'header:Accept': 'application/json',
      headers: [{ name: 'X-Tenant', value: 'tenant-1' }],
    })

    const serialized = await serializeAssetToJsonLd(parsed)

    expect(serialized.dataAddress).toEqual({
      type: 'ProxyHttpData',
      baseUrl: 'https://example.com/orders',
      proxyPath: 'true',
      proxyQueryParams: 'false',
      proxyMethod: 'false',
      proxyBody: 'true',
      'header:Accept': 'application/json',
      'header:X-Tenant': 'tenant-1',
    })
  })
})
