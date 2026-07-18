import { describe, expect, test } from 'vitest'
import { parseDatasetFromJsonLd, parseCatalogFromJsonLd } from '../../dataProvider/resources/catalog'

describe('catalogTransformers', () => {
  const mockJsonLdDataset = {
    '@id': 'dataset-123',
    'dct:title': 'Test Dataset',
    'dct:abstract': 'A test dataset for unit testing',
    'dct:description': 'Detailed description of the test dataset',
    type: 'Dataset',
    contenttype: 'application/json',
    'dcat:mediaType': 'application/json',
    'dcat:theme': 'Technology',
    'dcat:keyword': ['test', 'dataset', 'example'],
    'dspace:participantId': 'participant-456',
    'odrl:hasPolicy': [
      {
        '@id': 'policy-789',
        '@type': 'odrl:Policy',
        'odrl:permission': [
          {
            'odrl:action': {
              '@id': 'odrl:use',
            },
            'odrl:constraint': [
              {
                'odrl:leftOperand': {
                  '@id': 'odrl:dateTime',
                },
                'odrl:operator': {
                  '@id': 'odrl:lt',
                },
                'odrl:rightOperand': '2024-12-31T23:59:59Z',
              },
            ],
          },
        ],
        'odrl:prohibition': [
          {
            'odrl:action': {
              '@id': 'odrl:distribute',
            },
          },
        ],
      },
    ],
  }

  const mockJsonLdCatalog = {
    'dct:title': 'Test Catalog',
    'dct:description': 'A test catalog',
    'dcat:dataset': [mockJsonLdDataset],
  }

  test('should parse JSON-LD dataset to clean Dataset object', async () => {
    const result = await parseDatasetFromJsonLd(mockJsonLdDataset)

    expect(result.id).toBe('dataset-123')
    expect(result.title).toBe('Test Dataset')
    expect(result.abstract).toBe('A test dataset for unit testing')
    expect(result.description).toBe('Detailed description of the test dataset')
    expect(result.type).toBe('Dataset')
    expect(result.contenttype).toBe('application/json')
    expect(result.mediaType).toBe('application/json')
    expect(result.keywords).toEqual(['test', 'dataset', 'example'])
    expect(result.theme).toEqual({
      title: 'Technology',
    })

    // Check policies transformation
    expect(result.policies).toHaveLength(1)
    expect(result.policies![0].id).toBe('policy-789')
    expect(result.policies![0].type).toBe('odrl:Policy')
    expect(result.policies![0].permissions).toHaveLength(1)
    expect(result.policies![0].permissions![0].action).toBe('odrl:use')
    expect(result.policies![0].permissions![0].constraints).toHaveLength(1)
    expect(result.policies![0].permissions![0].constraints![0]).toEqual({
      leftOperand: 'dateTime',
      operator: 'lt',
      rightOperand: '2024-12-31T23:59:59Z',
    })
    expect(result.policies![0].prohibitions).toHaveLength(1)
    expect(result.policies![0].prohibitions![0].action).toBe('odrl:distribute')
  })

  test('parses compacted multilingual and IRI-valued catalog metadata', async () => {
    const result = await parseDatasetFromJsonLd({
      '@id': 'dataset-semantic',
      '@type': 'dcat:Dataset',
      'dct:title': [
        { '@language': 'en', '@value': 'Mobility data' },
        { '@language': 'de', '@value': 'Mobilitaetsdaten' },
      ],
      'dcat:keyword': { '@language': 'en', '@value': 'traffic' },
      'dcat:theme': { '@id': 'https://example.org/mobility' },
      'dcat:mediaType': { '@id': 'https://www.iana.org/assignments/media-types/application/json' },
    })

    expect(result).toMatchObject({
      id: 'dataset-semantic',
      type: 'dcat:Dataset',
      title: 'Mobility data',
      keywords: ['traffic'],
      theme: { title: 'https://example.org/mobility' },
      mediaType: 'https://www.iana.org/assignments/media-types/application/json',
    })
  })

  test('should parse JSON-LD catalog to clean Catalog object', async () => {
    const catalogId = 'catalog-test-id'
    const result = await parseCatalogFromJsonLd(mockJsonLdCatalog, catalogId)

    expect(result.id).toBe(catalogId)
    expect(result.title).toBe('Test Catalog')
    expect(result.description).toBe('A test catalog')
    expect(result.datasets).toHaveLength(1)
    expect(result.datasets[0].id).toBe('dataset-123')
    expect(result.datasets[0].title).toBe('Test Dataset')
  })

  test('should handle single dataset (not array)', async () => {
    const catalogWithSingleDataset = {
      'dct:title': 'Single Dataset Catalog',
      'dcat:dataset': mockJsonLdDataset, // Single object, not array
    }

    const catalogId = 'catalog-single'
    const result = await parseCatalogFromJsonLd(catalogWithSingleDataset, catalogId)

    expect(result.datasets).toHaveLength(1)
    expect(result.datasets[0].id).toBe('dataset-123')
  })

  test('should handle empty catalog', async () => {
    const emptyCatalog = {
      'dct:title': 'Empty Catalog',
    }

    const catalogId = 'catalog-empty'
    const result = await parseCatalogFromJsonLd(emptyCatalog, catalogId)

    expect(result.id).toBe(catalogId)
    expect(result.title).toBe('Empty Catalog')
    expect(result.datasets).toEqual([])
  })

  test('should handle dataset with single policy (not array)', async () => {
    const datasetWithSinglePolicy = {
      ...mockJsonLdDataset,
      'odrl:hasPolicy': {
        '@id': 'policy-single',
        '@type': 'odrl:Policy',
        'odrl:permission': {
          'odrl:action': {
            '@id': 'odrl:read',
          },
        },
      },
    }

    const result = await parseDatasetFromJsonLd(datasetWithSinglePolicy)

    expect(result.policies).toHaveLength(1)
    expect(result.policies![0].id).toBe('policy-single')
    expect(result.policies![0].permissions).toHaveLength(1)
    expect(result.policies![0].permissions![0].action).toBe('odrl:read')
  })

  test('should handle grouped odrl:and policy constraints', async () => {
    const datasetWithGroupedConstraint = {
      ...mockJsonLdDataset,
      'odrl:hasPolicy': {
        '@id': 'policy-grouped',
        '@type': 'odrl:Offer',
        'odrl:permission': {
          'odrl:action': { '@id': 'odrl:use' },
          'odrl:constraint': {
            'odrl:and': [
              {
                'odrl:leftOperand': {
                  '@id': 'https://w3id.org/catenax/2025/9/policy/Membership',
                },
                'odrl:operator': { '@id': 'odrl:eq' },
                'odrl:rightOperand': 'active',
              },
              {
                'odrl:leftOperand': {
                  '@id': 'https://w3id.org/catenax/2025/9/policy/FrameworkAgreement',
                },
                'odrl:operator': { '@id': 'odrl:eq' },
                'odrl:rightOperand': 'DataExchangeGovernance:1.0',
              },
            ],
          },
        },
      },
    }

    const result = await parseDatasetFromJsonLd(datasetWithGroupedConstraint)

    expect(result.policies![0].permissions![0].constraints).toEqual([
      {
        leftOperand: 'Membership',
        operator: 'eq',
        rightOperand: 'active',
      },
      {
        leftOperand: 'FrameworkAgreement',
        operator: 'eq',
        rightOperand: 'DataExchangeGovernance:1.0',
      },
    ])
    expect(result.policies![0].raw?.['odrl:permission']['odrl:constraint']).toEqual({
      'odrl:and': datasetWithGroupedConstraint['odrl:hasPolicy']['odrl:permission']['odrl:constraint']['odrl:and'],
    })
  })

  test('should handle dataset without policies', async () => {
    const datasetWithoutPolicies = {
      '@id': 'dataset-no-policies',
      'dct:title': 'Dataset Without Policies',
      'dct:abstract': 'A dataset with no policies',
    }

    const result = await parseDatasetFromJsonLd(datasetWithoutPolicies)

    expect(result.id).toBe('dataset-no-policies')
    expect(result.title).toBe('Dataset Without Policies')
    expect(result.policies).toEqual([])
  })

  test('should handle dataset with missing or null id', async () => {
    const datasetWithNoId = {
      'dct:title': 'Dataset with no ID',
      'dct:abstract': 'This dataset has no @id field.',
    }
    const datasetWithNullId = {
      '@id': null,
      'dct:title': 'Dataset with null ID',
      'dct:abstract': 'This dataset has a null @id field.',
    }

    const resultNoId = await parseDatasetFromJsonLd(datasetWithNoId)
    expect(resultNoId.id).toBe('unknown-id')
    expect(resultNoId.title).toBe('Dataset with no ID')

    const resultNullId = await parseDatasetFromJsonLd(datasetWithNullId)
    expect(resultNullId.id).toBe('unknown-id')
    expect(resultNullId.title).toBe('Dataset with null ID')
  })
})
