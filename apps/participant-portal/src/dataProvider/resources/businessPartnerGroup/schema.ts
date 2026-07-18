import { z } from 'zod'

export const BUSINESS_PARTNER_GROUP_CONTEXT = {
  '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
  tx: 'https://w3id.org/tractusx/v0.0.1/ns/',
}

export const CoreBpnGroupSchema = z
  .object({
    '@id': z.string(),
  })
  .passthrough()

export const CoreGroupBpnsSchema = z
  .object({
    '@id': z.string(),
  })
  .passthrough()

export type CoreBpnGroup = z.infer<typeof CoreBpnGroupSchema>
export type CoreGroupBpns = z.infer<typeof CoreGroupBpnsSchema>
