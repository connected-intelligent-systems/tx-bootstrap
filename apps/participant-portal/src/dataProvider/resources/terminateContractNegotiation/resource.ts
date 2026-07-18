import { CreateParams } from "react-admin";
import { TerminateContractNegotiation } from "../../../types/terminateContractNegotiation";
import { stripUndefinedValues } from "../../shared/helpers";
import { httpClient } from "../../shared/httpClient";

const parseCreatedAt = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return new Date(value).toISOString();
  return String(value);
};

export async function parseTerminateContractNegotiationFromJsonLd(
  jsonLd: any,
): Promise<TerminateContractNegotiation> {
  return stripUndefinedValues({
    id: jsonLd["@id"] || jsonLd.id,
    type: jsonLd["@type"] || jsonLd.type || "TerminateContractNegotiation",
    negotiationId: jsonLd.negotiationId || jsonLd.id || jsonLd["@id"],
    reason: jsonLd.reason || "",
    state: jsonLd.state || "",
    createdAt: parseCreatedAt(jsonLd.createdAt),
  }) as TerminateContractNegotiation;
}

export async function create(params: CreateParams) {
  const payload = {
    "@context": {
      "@vocab": "https://w3id.org/edc/v0.0.1/ns/",
    },
    "@type": "TerminateNegotiation",
    "@id": params.data.id,
    reason: params.data.reason,
  };

  await httpClient(
    `/api/management/v3/contractnegotiations/${params.data.id}/terminate`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return {
    data: {
      id: params.data.id,
      negotiationId: params.data.id,
      reason: params.data.reason || "",
      state: "TERMINATED",
      type: "TerminateNegotiation",
      createdAt: new Date().toISOString(),
    },
  };
}
