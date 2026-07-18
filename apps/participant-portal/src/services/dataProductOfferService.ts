type OfferPolicyData = Record<string, unknown>

export type CreateDataProductOfferInput = {
  assetId: string
  title: string
  accessPolicy: OfferPolicyData
  usagePolicy: OfferPolicyData
}

export class OfferCreationError extends Error {
  orphanedPolicyIds: string[]

  constructor(cause: unknown, orphanedPolicyIds: string[]) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = 'OfferCreationError'
    this.orphanedPolicyIds = orphanedPolicyIds
  }
}

export const createDataProductOffer = async (dataProvider: any, input: CreateDataProductOfferInput) => {
  const createdPolicyIds: string[] = []
  try {
    const access = await dataProvider.create('policies', { data: input.accessPolicy })
    createdPolicyIds.push(access.data.id)
    const usage = await dataProvider.create('policies', { data: input.usagePolicy })
    createdPolicyIds.push(usage.data.id)
    return await dataProvider.create('contractdefinitions', {
      data: {
        privateProperties: {
          name: `${input.title} offer`,
          description: `Offer for ${input.title}`,
        },
        accessPolicyId: access.data.id,
        contractPolicyId: usage.data.id,
        assetsSelector: [input.assetId],
      },
    })
  } catch (cause) {
    const orphanedPolicyIds: string[] = []
    for (const id of createdPolicyIds.reverse()) {
      try {
        await dataProvider.delete('policies', { id, previousData: { id } })
      } catch {
        orphanedPolicyIds.push(id)
      }
    }
    throw new OfferCreationError(cause, orphanedPolicyIds)
  }
}
