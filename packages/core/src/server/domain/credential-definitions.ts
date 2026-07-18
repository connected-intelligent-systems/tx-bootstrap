export const holderAttestationId = "dataspace-holder-attestation";
export const policyClaimsAttestationId = "dataspace-policy-claims-attestation";

export const baseCredentialMappings = [
  { input: "did", output: "credentialSubject.id", required: true },
  {
    input: "holder_id",
    output: "credentialSubject.holderIdentifier",
    required: true,
  },
] as const;

export const credentialDefinitions = [
  {
    id: "tx-membership-credential",
    credentialType: "MembershipCredential",
    format: "VC1_0_JWT",
    attestations: [holderAttestationId, policyClaimsAttestationId],
    mappings: [
      ...baseCredentialMappings,
      {
        input: "member_of",
        output: "credentialSubject.memberOf",
        required: false,
      },
    ],
  },
  {
    id: "tx-bpn-credential",
    credentialType: "BpnCredential",
    format: "VC1_0_JWT",
    attestations: [holderAttestationId, policyClaimsAttestationId],
    mappings: [
      ...baseCredentialMappings,
      { input: "bpn", output: "credentialSubject.bpn", required: true },
    ],
  },
  {
    id: "tx-data-exchange-governance-credential",
    credentialType: "DataExchangeGovernanceCredential",
    format: "VC1_0_JWT",
    attestations: [holderAttestationId, policyClaimsAttestationId],
    mappings: [
      ...baseCredentialMappings,
      {
        input: "group_name",
        output: "credentialSubject.group",
        required: true,
      },
      {
        input: "use_case",
        output: "credentialSubject.useCase",
        required: true,
      },
      {
        input: "contract_template",
        output: "credentialSubject.contractTemplate",
        required: false,
      },
      {
        input: "contract_version",
        output: "credentialSubject.contractVersion",
        required: true,
      },
    ],
  },
] as const;

export type CredentialDefinition = (typeof credentialDefinitions)[number];
