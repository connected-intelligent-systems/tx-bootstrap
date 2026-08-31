import { describe, expect, it } from 'vitest'
import {
  buildCurlCommand,
  supportsHttpDownload,
  supportsPullAccess,
} from '../../pages/dataProducts/TransferAccessDetailsDialog'
import type { Dataset } from '../../types/catalog'
import type { TransferProcess } from '../../types/transferProcess'

const transfer = (values: Partial<TransferProcess>): TransferProcess => ({
  id: 'transfer-1',
  jsonLdType: 'TransferProcess',
  state: 'STARTED',
  stateTimestamp: new Date().toISOString(),
  transferDirection: 'CONSUMER',
  transferType: 'HttpData-PULL',
  contractId: 'agreement-1',
  assetId: 'asset-1',
  ...values,
})

describe('HTTP pull transfer access details', () => {
  it('supports consumer HttpData-PULL transfers', () => {
    expect(supportsPullAccess(transfer({}))).toBe(true)
  })

  it('supports other consumer pull transfer types', () => {
    expect(supportsPullAccess(transfer({ transferType: 'AmazonS3-PULL' }))).toBe(true)
    expect(supportsPullAccess(transfer({ transferType: 'AzureStorage-PULL' }))).toBe(true)
    expect(supportsPullAccess(transfer({ transferType: 'HttpData-PUSH' }))).toBe(false)
  })

  it('builds a quoted curl command with the authorization header', () => {
    expect(
      buildCurlCommand({
        id: 'transfer-1',
        endpoint: "https://example.test/data?name=demo's",
        authorization: 'Bearer demo-token',
      }),
    ).toBe("curl --fail-with-body -H 'Authorization: Bearer demo-token' 'https://example.test/data?name=demo'\"'\"'s'")
  })

  it('does not expose access details for provider or non-pull transfers', () => {
    expect(supportsPullAccess(transfer({ transferDirection: 'PROVIDER' }))).toBe(false)
    expect(supportsPullAccess(transfer({ transferType: 'HttpData-PUSH' }))).toBe(false)
  })

  it('offers downloads only for consumer HTTP pull datasets without an API description', () => {
    const fileDataset = { id: 'asset-1' } satisfies Dataset
    const apiDataset = { id: 'asset-1', apiDescription: { openapi: '3.1.0', info: { title: 'API', version: '1' } } }

    expect(supportsHttpDownload(transfer({}), fileDataset, 'https://example.test/file.csv')).toBe(true)
    expect(supportsHttpDownload(transfer({}), apiDataset, 'https://example.test/api')).toBe(false)
    expect(supportsHttpDownload(transfer({ transferDirection: 'PROVIDER' }), fileDataset, 'https://example.test')).toBe(
      false,
    )
    expect(supportsHttpDownload(transfer({ transferType: 'AmazonS3-PULL' }), fileDataset, 's3://bucket/key')).toBe(
      false,
    )
    expect(supportsHttpDownload(transfer({}), fileDataset)).toBe(false)
  })
})
