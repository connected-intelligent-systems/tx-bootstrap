import { CreateParams } from "react-admin";
import { TerminateTransferProcess } from "../../../types/terminateTransferProcess";
import { stripUndefinedValues } from "../../shared/helpers";
import { httpClient } from "../../shared/httpClient";

const parseCreatedAt = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return new Date(value).toISOString();
  return String(value);
};

export async function parseTerminateTransferProcessFromJsonLd(
  jsonLd: any,
): Promise<TerminateTransferProcess> {
  return stripUndefinedValues({
    id: jsonLd["@id"] || jsonLd.id,
    type: jsonLd["@type"] || jsonLd.type || "TerminateTransferProcess",
    transferId: jsonLd.transferId || jsonLd.id || jsonLd["@id"],
    reason: jsonLd.reason || "",
    state: jsonLd.state || "",
    createdAt: parseCreatedAt(jsonLd.createdAt),
  }) as TerminateTransferProcess;
}

export async function create(params: CreateParams) {
  const payload = {
    "@context": {
      "@vocab": "https://w3id.org/edc/v0.0.1/ns/",
    },
    "@type": "TerminateTransfer",
    reason: params.data.reason,
  };

  await httpClient(
    `/api/management/v3/transferprocesses/${params.data.id}/terminate`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return {
    data: {
      id: params.data.id,
      transferId: params.data.id,
      reason: params.data.reason || "",
      state: "TERMINATED",
      type: "TerminateTransfer",
      createdAt: new Date().toISOString(),
    },
  };
}
