import type { CredentialDefinition } from "./credential-definitions.js";

export function buildCredentialRequestPayload({
  issuerDid,
  holderPid,
  definitions,
}: {
  issuerDid: string;
  holderPid: string;
  definitions: readonly CredentialDefinition[];
}) {
  return {
    issuerDid,
    holderPid,
    credentials: definitions.map((definition) => ({
      id: definition.id,
      type: definition.credentialType,
      format: definition.format,
    })),
  };
}
