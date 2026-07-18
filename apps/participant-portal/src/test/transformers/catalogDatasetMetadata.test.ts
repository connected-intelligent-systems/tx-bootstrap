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
})
