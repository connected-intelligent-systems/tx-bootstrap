import { describe, expect, it, vi } from 'vitest'
import { createDataProductOffer, OfferCreationError } from '../../services/dataProductOfferService'

const input = {
  assetId: 'asset-1',
  title: 'Product one',
  accessPolicy: { name: 'Access' },
  usagePolicy: { name: 'Usage' },
}

describe('data product offer creation', () => {
  it('creates both policies before the one-product contract definition', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: 'access-policy' } })
      .mockResolvedValueOnce({ data: { id: 'usage-policy' } })
      .mockResolvedValueOnce({ data: { id: 'offer-1' } })

    await createDataProductOffer({ create, delete: vi.fn() }, input)

    expect(create).toHaveBeenLastCalledWith(
      'contractdefinitions',
      expect.objectContaining({
        data: expect.objectContaining({
          accessPolicyId: 'access-policy',
          contractPolicyId: 'usage-policy',
          assetsSelector: ['asset-1'],
        }),
      }),
    )
  })

  it('deletes generated policies and reports IDs that could not be cleaned up', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: 'access-policy' } })
      .mockResolvedValueOnce({ data: { id: 'usage-policy' } })
      .mockRejectedValueOnce(new Error('definition failed'))
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new Error('usage cleanup failed'))
      .mockResolvedValueOnce({ data: { id: 'access-policy' } })

    const error = await createDataProductOffer({ create, delete: remove }, input).catch((reason) => reason)

    expect(error).toBeInstanceOf(OfferCreationError)
    expect(error.orphanedPolicyIds).toEqual(['usage-policy'])
    expect(remove).toHaveBeenNthCalledWith(1, 'policies', {
      id: 'usage-policy',
      previousData: { id: 'usage-policy' },
    })
    expect(remove).toHaveBeenNthCalledWith(2, 'policies', {
      id: 'access-policy',
      previousData: { id: 'access-policy' },
    })
  })
})
