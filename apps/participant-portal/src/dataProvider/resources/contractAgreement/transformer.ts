import { ContractAgreement } from '../../../types/contractAgreement'
import { PolicySchema } from '../catalog/schema'
import { parsePolicyFromJsonLd } from '../policy'
import { stripUndefinedValues } from '../../shared/helpers'
import { CoreContractAgreementSchema } from './schema'

async function parseAgreementPolicy(policy: any): Promise<ContractAgreement['policy']> {
  if (!policy) {
    return { id: '', type: 'Policy' }
  }

  const catalogPolicy = PolicySchema.safeParse(policy)
  if (catalogPolicy.success) {
    return catalogPolicy.data
  }

  const parsedPolicy = (await parsePolicyFromJsonLd(policy)) as any
  return stripUndefinedValues({
    id: parsedPolicy.id || policy['@id'] || policy.id || '',
    type: parsedPolicy.policyType || parsedPolicy.type || policy['@type'] || policy.type || 'Policy',
    permissions: parsedPolicy.rules?.permissions || parsedPolicy.permissions || [],
    prohibitions: parsedPolicy.rules?.prohibitions || parsedPolicy.prohibitions || [],
    obligations: parsedPolicy.rules?.obligations || parsedPolicy.obligations || [],
  }) as ContractAgreement['policy']
}

export async function parseContractAgreementFromJsonLd(jsonLd: any): Promise<ContractAgreement> {
  try {
    const agreementData = jsonLd.contractAgreement || jsonLd
    const parsed = CoreContractAgreementSchema.parse(agreementData)
    const policy = await parseAgreementPolicy(agreementData.policy || jsonLd.policy)

    const agreement: ContractAgreement = {
      id: parsed['@id'],
      type: parsed['@type'],
      providerId: parsed.providerId,
      consumerId: parsed.consumerId,
      assetId: parsed.assetId,
      contractSigningDate: parsed.contractSigningDate,
      policy,
    }
    return stripUndefinedValues(agreement)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error('Failed to transform JSON-LD contract agreement: ' + errorMessage, { cause: error })
  }
}

export async function parseContractAgreementFromJsonLdArray(jsonLdArray: any[]): Promise<ContractAgreement[]> {
  return Promise.all(jsonLdArray.map((jsonLd) => parseContractAgreementFromJsonLd(jsonLd)))
}
