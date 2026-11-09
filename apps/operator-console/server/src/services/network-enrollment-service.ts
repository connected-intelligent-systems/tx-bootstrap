import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { isIPv4 } from "node:net";
import type { Repositories } from "@tx-bootstrap/core/server/db/repositories/index.js";
import type { NetworkEnrollmentRow } from "@tx-bootstrap/core/server/db/database.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  httpError,
  unauthorized,
} from "@tx-bootstrap/core/server/http/errors.js";
import type { HeadscaleConfig } from "../config/headscale.js";
import {
  createHeadscaleClient,
  type HeadscaleClient,
} from "./headscale-client.js";

/** Actor recorded for revocations the console performs on its own. */
export const NETWORK_RECONCILER_ACTOR = "system:network-reconciler";

/** Stable per participant so its did:web survives re-enrollment. */
export function tunnelHostname(bpn: string) {
  return bpn.toLowerCase();
}

export function createNetworkEnrollmentService({
  config,
  repositories,
  client = createHeadscaleClient(config),
}: {
  config: HeadscaleConfig;
  repositories: Pick<Repositories, "businessPartners" | "networkEnrollments">;
  client?: HeadscaleClient;
}) {
  const { businessPartners, networkEnrollments } = repositories;

  function requireEnabled() {
    if (!config.enabled)
      throw httpError(503, "Headscale integration is disabled");
  }
  function uuid(value: string) {
    const result = z.uuid().safeParse(value);
    if (!result.success)
      throw new BadRequestError("Participant and deployment IDs must be UUIDs");
    return result.data.toLowerCase();
  }
  async function participant(value: string) {
    requireEnabled();
    const participantId = uuid(value);
    const partner = await businessPartners.load(participantId);
    if (!partner) throw new NotFoundError("Participant not found");
    return partner;
  }
  function metadata(row: NetworkEnrollmentRow, bpn: string) {
    const hostname = tunnelHostname(bpn);
    return {
      deploymentId: row.id,
      participantId: row.business_partner_id,
      provider: "headscale" as const,
      controlUrl: row.control_url,
      hostname,
      publicHost: `${hostname}.${config.participantDomain}`,
      tag: row.participant_tag,
      state: row.state,
      enrollmentExpiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  const service = {
    /** Routing authority: never derive a destination from a client hostname. */
    async getTunnelRoutes(authorization?: string) {
      requireEnabled();
      const expected = Buffer.from(`Bearer ${config.routingApiKey}`);
      const supplied = Buffer.from(authorization ?? "");
      if (
        !config.routingApiKey ||
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        throw unauthorized();
      const issued = await networkEnrollments.listIssued(config.url);
      if (issued.length === 0) return "";
      const nodes = await client.listNodes();
      const routes: string[] = [];
      for (const row of issued) {
        if (
          !row.pre_auth_key_id ||
          !/^BPNL[A-Z0-9]{12}$/.test(row.assigned_bpn)
        )
          continue;
        const matches = nodes.filter(
          (node) => node.preAuthKey?.id === row.pre_auth_key_id,
        );
        const address =
          matches.length === 1 ? tunnelAddress(matches[0]) : undefined;
        if (address)
          routes.push(
            `"${tunnelHostname(row.assigned_bpn)}.${config.participantDomain}" "${address}";`,
          );
      }
      return routes.sort().join("\n") + (routes.length ? "\n" : "");
    },
    async getNetworkStatus() {
      if (!config.enabled) return { enabled: false };
      await client.listNodes();
      return {
        enabled: true,
        provider: "headscale",
        controlUrl: config.url,
        participantTag: config.participantTag,
        enrollmentTtlSeconds: config.enrollmentTtlSeconds,
        invitationTtlSeconds: config.invitationTtlSeconds,
        participantDomain: config.participantDomain,
        reachable: true,
      };
    },
    async createNetworkEnrollment(
      participantId: string,
      input: unknown,
      actor: string,
    ) {
      const partner = await participant(participantId);
      if (partner.verification_status !== "VERIFIED" || !partner.assigned_bpn) {
        throw new ConflictError(
          "A verified participant with an assigned BPN is required",
        );
      }
      const parsed = z
        .object({
          deploymentId: z.uuid(),
          // Invitation keys travel with the registration token and wait for
          // the participant's first deployment, so they live longer.
          purpose: z.enum(["deployment", "invitation"]).default("deployment"),
        })
        .strict()
        .safeParse(input);
      if (!parsed.success)
        throw new BadRequestError(
          "Expected a deploymentId UUID and an optional purpose",
        );
      const deploymentId = parsed.data.deploymentId.toLowerCase();
      const ttlSeconds =
        parsed.data.purpose === "invitation"
          ? config.invitationTtlSeconds
          : config.enrollmentTtlSeconds;
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const reserved = await networkEnrollments.reserve({
        id: deploymentId,
        participantId: partner.id,
        controlUrl: config.url,
        participantTag: config.participantTag,
        expiresAt,
      });
      if (!reserved)
        throw new ConflictError(
          "Deployment ID already exists; enrollment keys cannot be retrieved again",
        );

      let createdKey: { id: string; key: string } | undefined;
      try {
        return await networkEnrollments.withLock(
          partner.id,
          deploymentId,
          async ({ row, update, audit }) => {
            if (row.state !== "CREATING")
              throw new ConflictError("Enrollment creation already attempted");
            createdKey = await client.createEnrollmentKey(expiresAt);
            const updated = await update("ISSUED", createdKey.id);
            await audit("participant.network_enrollment_created", actor);
            const result = metadata(updated, partner.assigned_bpn);
            return {
              ...result,
              authKey: createdKey.key,
              // Values for deploy/compose/participant.tailnet.override.yaml.
              participantEnv: {
                HEADSCALE_URL: config.url,
                TAILNET_HOSTNAME: result.hostname,
                PARTICIPANT_PUBLIC_HOST: result.publicHost,
                PARTICIPANT_DID_HOST: result.publicHost,
              },
            };
          },
        );
      } catch {
        // Best effort compensation if a key was created but could not be committed.
        // A timeout can have an unknown remote result; never retry key creation.
        if (createdKey)
          await client.expireEnrollmentKey(createdKey.id).catch(() => {});
        await networkEnrollments
          .fail(deploymentId, createdKey?.id ?? null)
          .catch(() => {});
        throw httpError(
          502,
          "Enrollment creation failed; inspect the deployment record before retrying with a new ID",
        );
      }
    },
    async listNetworkEnrollments(participantId: string) {
      const partner = await participant(participantId);
      const rows = await networkEnrollments.list(partner.id);
      const needsNodes = rows.some(
        (row) =>
          row.control_url === config.url &&
          row.pre_auth_key_id &&
          row.state === "ISSUED",
      );
      const nodes = needsNodes ? await client.listNodes() : [];
      return rows.map((row) => {
        const matches =
          row.control_url === config.url &&
          row.pre_auth_key_id &&
          row.state === "ISSUED"
            ? nodes.filter(
                (node) => node.preAuthKey?.id === row.pre_auth_key_id,
              )
            : [];
        const node = matches.length === 1 ? matches[0] : null;
        const stale =
          !!node &&
          !node.online &&
          !!node.lastSeen &&
          Date.now() - Date.parse(node.lastSeen) >
            config.staleNodeSeconds * 1000;
        const connection =
          row.state !== "ISSUED" || row.control_url !== config.url
            ? "UNKNOWN"
            : matches.length > 1
              ? "AMBIGUOUS"
              : node
                ? node.online
                  ? "ONLINE"
                  : stale
                    ? "STALE"
                    : "OFFLINE"
                : row.expires_at.getTime() <= Date.now()
                  ? "EXPIRED"
                  : "AWAITING_JOIN";
        return {
          ...metadata(row, partner.assigned_bpn),
          connection,
          node: node
            ? {
                id: node.id,
                name: node.givenName || node.name,
                routable:
                  partner.verification_status === "VERIFIED" &&
                  !!tunnelAddress(node),
                ipAddresses: node.ipAddresses,
                online: node.online,
                lastSeen: node.lastSeen ?? null,
                expiresAt: node.expiry ?? null,
              }
            : null,
        };
      });
    },
    /**
     * One reconciliation pass: revoke what must no longer be on the tailnet,
     * then enforce node names. A failed revocation stays pending and is
     * retried on the next pass; it does not block the others.
     */
    async reconcileNetwork() {
      if (!config.enabled) return { renamed: 0, revoked: 0, failed: 0 };
      // An unknown remote result is never retried. Only release abandoned
      // reservations; a replacement needs a new explicit enrollment request.
      await networkEnrollments.recoverAbandoned(
        config.url,
        new Date(Date.now() - Math.max(60_000, config.timeoutMs * 2)),
      );
      const pending = await networkEnrollments.listPendingRevocations(
        config.url,
      );
      let revoked = 0;
      let failed = 0;
      for (const row of pending) {
        try {
          await service.revokeNetworkEnrollment(
            row.business_partner_id,
            row.id,
            NETWORK_RECONCILER_ACTOR,
          );
          revoked++;
        } catch {
          failed++;
        }
      }
      const { renamed } = await service.reconcileNodeNames();
      return { renamed, revoked, failed };
    },
    /**
     * Keep canonical MagicDNS names recognizable for operators. Public routing
     * uses enrollment key IDs and addresses and does not trust these names.
     */
    async reconcileNodeNames() {
      if (!config.enabled) return { renamed: 0 };
      const issued = await networkEnrollments.listIssued(config.url);
      if (issued.length === 0) return { renamed: 0 };
      const expectedByKey = new Map<string, string>();
      for (const row of issued) {
        if (row.pre_auth_key_id && row.assigned_bpn)
          expectedByKey.set(
            row.pre_auth_key_id,
            tunnelHostname(row.assigned_bpn),
          );
      }
      const reserved = new Set(expectedByKey.values());
      const nodes = await client.listNodes();
      let renamed = 0;
      // First release reserved names held by nodes from another enrollment.
      for (const node of nodes) {
        const expected = node.preAuthKey
          ? expectedByKey.get(node.preAuthKey.id)
          : undefined;
        if (reserved.has(node.givenName) && node.givenName !== expected) {
          await client.renameNode(node.id, `txb-unverified-${node.id}`);
          renamed++;
        }
      }
      // Then assign canonical names; skip keys with several nodes.
      const byKey = new Map<string, typeof nodes>();
      for (const node of nodes) {
        if (!node.preAuthKey) continue;
        byKey.set(node.preAuthKey.id, [
          ...(byKey.get(node.preAuthKey.id) ?? []),
          node,
        ]);
      }
      for (const [keyId, expected] of expectedByKey) {
        const matches = byKey.get(keyId) ?? [];
        if (matches.length === 1 && matches[0].givenName !== expected) {
          await client.renameNode(matches[0].id, expected);
          renamed++;
        }
      }
      return { renamed };
    },
    async revokeNetworkEnrollment(
      participantId: string,
      deploymentId: string,
      actor: string,
    ) {
      const partner = await participant(participantId);
      const id = uuid(deploymentId);
      // Commit revocation intent first. Failed remote cleanup remains retryable.
      await networkEnrollments.withLock(
        partner.id,
        id,
        async ({ row, update }) => {
          if (row.control_url !== config.url)
            throw new ConflictError(
              "Deployment belongs to a different Headscale server",
            );
          if (row.state === "REVOKED") return;
          if (!row.pre_auth_key_id) {
            throw new ConflictError(
              "Enrollment has no known key ID; inspect Headscale for an incomplete creation",
            );
          }
          await update("REVOKING");
        },
      );
      return networkEnrollments.withLock(
        partner.id,
        id,
        async ({ row, update, audit }) => {
          if (row.state === "REVOKED")
            return metadata(row, partner.assigned_bpn);
          if (row.state !== "REVOKING" || !row.pre_auth_key_id)
            throw new ConflictError("Deployment is not ready for revocation");
          await client.expireEnrollmentKey(row.pre_auth_key_id);
          const nodes = await client.listNodes();
          for (const node of nodes) {
            if (node.preAuthKey?.id === row.pre_auth_key_id)
              await client.deleteNode(node.id);
          }
          const updated = await update("REVOKED");
          await audit("participant.network_enrollment_revoked", actor);
          return metadata(updated, partner.assigned_bpn);
        },
      );
    },
  };
  return service;
}

function tunnelAddress(
  node: Awaited<ReturnType<HeadscaleClient["listNodes"]>>[number],
) {
  if (node.expiry && Date.parse(node.expiry) <= Date.now()) return undefined;
  const addresses = node.ipAddresses.filter((address) => {
    if (!isIPv4(address)) return false;
    const [first, second] = address.split(".").map(Number);
    return first === 100 && second >= 64 && second <= 127;
  });
  return addresses.length === 1 ? addresses[0] : undefined;
}
