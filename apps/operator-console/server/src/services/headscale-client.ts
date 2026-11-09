import { z } from "zod";
import { httpError } from "@tx-bootstrap/core/server/http/errors.js";
import type { HeadscaleConfig } from "../config/headscale.js";

// protobuf uint64 IDs are JSON strings. Do not round them through Number.
const id = z.string().regex(/^[1-9][0-9]*$/);
const nodeName = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
const nodeSchema = z.object({
  id,
  name: z.string().default(""),
  givenName: z.string().default(""),
  ipAddresses: z.array(z.string()).default([]),
  online: z.boolean().default(false),
  expiry: z.iso.datetime({ offset: true }).nullish(),
  preAuthKey: z.object({ id }).nullish(),
});

export function createHeadscaleClient(
  config: HeadscaleConfig,
  fetcher: typeof fetch = fetch,
) {
  async function request(
    method: string,
    path: string,
    body?: unknown,
    allowMissing = false,
  ) {
    try {
      const response = await fetcher(`${config.url}/api/v1${path}`, {
        method,
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs),
        redirect: "error",
      });
      if (allowMissing && response.status === 404) {
        await response.body?.cancel();
        return {};
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Upstream request failed");
      }
      return (await response.json()) as unknown;
    } catch {
      // Upstream bodies, fetch errors and validation errors can contain secrets.
      throw httpError(
        502,
        "Headscale request failed; check operator connectivity and API credentials",
      );
    }
  }

  return {
    async createEnrollmentKey(expiresAt: Date) {
      const payload = await request("POST", "/preauthkey", {
        reusable: false,
        ephemeral: false,
        expiration: expiresAt.toISOString(),
        aclTags: [config.participantTag],
      });
      const parsed = z
        .object({ preAuthKey: z.object({ id, key: z.string().min(1) }) })
        .safeParse(payload);
      if (!parsed.success)
        throw httpError(
          502,
          "Headscale returned an invalid enrollment response",
        );
      return parsed.data.preAuthKey;
    },
    async listNodes() {
      const payload = await request("GET", "/node");
      const parsed = z
        .object({ nodes: z.array(nodeSchema).default([]) })
        .safeParse(payload);
      if (!parsed.success)
        throw httpError(502, "Headscale returned an invalid node response");
      // Zod strips every field not explicitly selected, including preAuthKey.key.
      return parsed.data.nodes;
    },
    async expireEnrollmentKey(keyId: string) {
      await request(
        "POST",
        "/preauthkey/expire",
        { id: id.parse(keyId) },
        true,
      );
    },
    async deleteNode(nodeId: string) {
      await request("DELETE", `/node/${id.parse(nodeId)}`, undefined, true);
    },
    async renameNode(nodeId: string, name: string) {
      // The ingress routes <name>.<participant domain> by this MagicDNS name,
      // so only the operator may assign it.
      const safeName = nodeName.parse(name);
      await request(
        "POST",
        `/node/${id.parse(nodeId)}/rename/${encodeURIComponent(safeName)}`,
      );
    },
  };
}

export type HeadscaleClient = ReturnType<typeof createHeadscaleClient>;
