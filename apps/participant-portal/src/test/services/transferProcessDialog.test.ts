import { describe, expect, it } from 'vitest'
import { sanitizeTransferProcessPayload } from '../../components/transferprocesses/TransferProcessDialog'

const base = { counterPartyAddress: 'https://provider/dsp', contractId: 'agreement', assetId: 'asset' }

describe('transfer process dialog payload', () => {
  it('keeps supported HTTP push destination parameters', () => {
    expect(
      sanitizeTransferProcessPayload({
        ...base,
        transferType: 'HttpData-PUSH',
        dataDestination: {
          baseUrl: 'https://receiver/data',
          method: 'PUT',
          path: '/items',
          contentType: 'application/json',
          authKey: 'Authorization',
          authCode: 'Bearer token',
          ignored: 'value',
        },
      }),
    ).toMatchObject({
      transferType: 'HttpData-PUSH',
      dataDestination: {
        type: 'HttpData',
        baseUrl: 'https://receiver/data',
        method: 'PUT',
        path: '/items',
        contentType: 'application/json',
        authKey: 'Authorization',
        authCode: 'Bearer token',
      },
    })
  })

  it('uses the EDC S3 keyName destination property', () => {
    expect(
      sanitizeTransferProcessPayload({
        ...base,
        transferType: 'AmazonS3-PUSH',
        dataDestination: {
          region: 'eu-central-1',
          bucketName: 'demo',
          keyName: 'result.json',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
        },
      }).dataDestination,
    ).toMatchObject({ type: 'AmazonS3', keyName: 'result.json' })
  })

  it('supports Azure Storage push destinations', () => {
    expect(
      sanitizeTransferProcessPayload({
        ...base,
        transferType: 'AzureStorage-PUSH',
        dataDestination: { account: 'demo', container: 'incoming', blobName: 'result.json', sharedKey: 'secret' },
      }).dataDestination,
    ).toEqual({
      type: 'AzureStorage',
      account: 'demo',
      container: 'incoming',
      blobName: 'result.json',
      sharedKey: 'secret',
    })
  })
})
