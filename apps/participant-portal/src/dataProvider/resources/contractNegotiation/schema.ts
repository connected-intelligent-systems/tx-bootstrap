import { z } from 'zod'

const CoreContractNegotiationSchema = z.object({
  '@id': z.string(),
  '@type': z.string(),
  type: z.string(),
  state: z.string(),
  protocol: z.string(),
  counterPartyAddress: z.string(),
  counterPartyId: z.string(),
  datasetId: z.string().optional(),
  assetId: z.string().optional(),
  policy: z.object({ target: z.string().optional() }).passthrough().optional(),
  errorDetail: z.string().optional(),
  createdAt: z.number().transform((val) => new Date(val).toISOString()),
  updatedAt: z
    .number()
    .transform((val) => new Date(val).toISOString())
    .optional(),
  contractAgreementId: z.string().optional(),
})

export { CoreContractNegotiationSchema }
