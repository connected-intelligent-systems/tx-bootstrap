import { describe, expect, it } from 'vitest'
import { parseDatasetFromJsonLd } from '../../dataProvider/resources/catalog/transformer'

describe('catalog dataset metadata compatibility', () => {
  it('keeps connector-native name and description fields', async () => {
    const dataset = await parseDatasetFromJsonLd({
      '@id': 'asset-1',
      '@type': 'dcat:Dataset',
      name: 'Native dataset name',
      description: 'Native detailed description',
    })

    expect(dataset.title).toBe('Native dataset name')
    expect(dataset.description).toBe('Native detailed description')
  })

  it('reads endpoint-neutral API descriptions from catalog metadata', async () => {
    const apiDescription = {
      openapi: '3.1.0',
      info: { title: 'Orders', version: '1.0.0' },
      paths: { '/orders': { get: { responses: { 200: { description: 'ok' } } } } },
    }
    const dataset = await parseDatasetFromJsonLd({
      '@id': 'orders-api',
      'dct:title': 'Orders',
      'txb:apiDescription': JSON.stringify(apiDescription),
    })

    expect(dataset.apiDescription).toEqual(apiDescription)
  })
})
