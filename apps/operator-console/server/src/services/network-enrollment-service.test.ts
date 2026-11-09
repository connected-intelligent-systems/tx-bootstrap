import { describe, expect, it, vi } from "vitest";
import type { Repositories } from "@tx-bootstrap/core/server/db/repositories/index.js";
import type { NetworkEnrollmentRepository } from "@tx-bootstrap/core/server/db/repositories/network-enrollments.js";
import type { NetworkEnrollmentRow } from "@tx-bootstrap/core/server/db/database.js";
import { readHeadscaleConfig } from "../config/headscale.js";
import {
  NETWORK_RECONCILER_ACTOR,
  createNetworkEnrollmentService,
} from "./network-enrollment-service.js";
import type { HeadscaleClient } from "./headscale-client.js";

const participantId = "550e8400-e29b-41d4-a716-446655440000";
const deploymentId = "550e8400-e29b-41d4-a716-446655440001";
const config = readHeadscaleConfig({
  HEADSCALE_ENABLED: "true",
  HEADSCALE_URL: "https://headscale.example.org",
  HEADSCALE_API_KEY: "admin-secret",
  HEADSCALE_ROUTING_API_KEY: "routing-secret-00000000000000000000",
  HEADSCALE_PARTICIPANT_DOMAIN: "tunnel.example.org",
});

function fixture() {
  const rows = new Map<string, NetworkEnrollmentRow>();
  const bpnByParticipant = new Map([[participantId, "BPNL000000000001"]]);
  const rejected = new Set<string>();
  const events: unknown[] = [];
  const client = {
    createEnrollmentKey: vi
      .fn<HeadscaleClient["createEnrollmentKey"]>()
      .mockResolvedValue({ id: "7", key: "join-secret" }),
    listNodes: vi.fn<HeadscaleClient["listNodes"]>().mockResolvedValue([]),
    expireEnrollmentKey: vi
      .fn<HeadscaleClient["expireEnrollmentKey"]>()
      .mockResolvedValue(undefined),
    deleteNode: vi
      .fn<HeadscaleClient["deleteNode"]>()
      .mockResolvedValue(undefined),
    renameNode: vi
      .fn<HeadscaleClient["renameNode"]>()
      .mockResolvedValue(undefined),
  };
  const networkEnrollments: NetworkEnrollmentRepository = {
    async recoverAbandoned(controlUrl, staleBefore) {
      let count = 0;
      for (const row of rows.values()) {
        if (
          row.control_url === controlUrl &&
          row.state === "CREATING" &&
          row.updated_at <= staleBefore
        ) {
          row.state = "FAILED";
          count++;
        }
      }
      return count;
    },
    async reserve(input) {
      if (rows.has(input.id)) return undefined;
      if (
        [...rows.values()].some(
          (row) =>
            row.business_partner_id === input.participantId &&
            ["CREATING", "ISSUED", "REVOKING"].includes(row.state),
        )
      )
        throw Object.assign(new Error("active"), { status: 409 });
      const row: NetworkEnrollmentRow = {
        id: input.id,
        business_partner_id: input.participantId,
        control_url: input.controlUrl,
        participant_tag: input.participantTag,
        pre_auth_key_id: null,
        state: "CREATING",
        expires_at: input.expiresAt,
        created_at: new Date(),
        updated_at: new Date(),
      };
      rows.set(row.id, row);
      return row;
    },
    async listIssued(controlUrl) {
      return [...rows.values()]
        .filter(
          (row) => row.state === "ISSUED" && row.control_url === controlUrl,
        )
        .filter((row) => !rejected.has(row.business_partner_id))
        .map((row) => ({
          id: row.id,
          pre_auth_key_id: row.pre_auth_key_id,
          assigned_bpn: bpnByParticipant.get(row.business_partner_id) ?? "",
        }));
    },
    async listPendingRevocations(controlUrl) {
      return [...rows.values()]
        .filter(
          (row) =>
            row.control_url === controlUrl &&
            (row.state === "REVOKING" ||
              (row.state === "ISSUED" &&
                rejected.has(row.business_partner_id))),
        )
        .map((row) => ({
          id: row.id,
          business_partner_id: row.business_partner_id,
        }));
    },
    async list(id) {
      return [...rows.values()].filter((row) => row.business_partner_id === id);
    },
    async fail(id, keyId) {
      const row = rows.get(id)!;
      rows.set(id, { ...row, state: "FAILED", pre_auth_key_id: keyId });
    },
    async withLock(id, deployment, work) {
      const row = rows.get(deployment);
      if (!row || row.business_partner_id !== id)
        throw Object.assign(new Error("not found"), { status: 404 });
      const eventCount = events.length;
      try {
        return await work({
          row: structuredClone(row),
          async update(state, keyId) {
            const updated = {
              ...row,
              state,
              pre_auth_key_id: keyId ?? row.pre_auth_key_id,
            };
            rows.set(deployment, updated);
            return updated;
          },
          async audit(action, actor) {
            events.push({ deploymentId: deployment, action, actor });
          },
        });
      } catch (error) {
        rows.set(deployment, row);
        events.length = eventCount;
        throw error;
      }
    },
  };
  const load = vi.fn().mockResolvedValue({
    id: participantId,
    assigned_bpn: "BPNL000000000001",
    verification_status: "VERIFIED",
  });
  const repositories = {
    businessPartners: { load } as unknown as Repositories["businessPartners"],
    networkEnrollments,
  };
  const service = createNetworkEnrollmentService({
    config,
    repositories,
    client,
  });
  return { service, rows, events, client, repositories, load, rejected };
}

describe("deployment network enrollment", () => {
  it("releases an abandoned reservation without minting or retrying a key", async () => {
    const f = fixture();
    await f.repositories.networkEnrollments.reserve({
      id: deploymentId,
      participantId,
      controlUrl: config.url,
      participantTag: config.participantTag,
      expiresAt: new Date(Date.now() + 900_000),
    });
    f.rows.get(deploymentId)!.updated_at = new Date(Date.now() - 120_000);
    await f.service.reconcileNetwork();
    expect(f.rows.get(deploymentId)!.state).toBe("FAILED");
    expect(f.client.createEnrollmentKey).not.toHaveBeenCalled();
    await expect(
      f.service.createNetworkEnrollment(
        participantId,
        { deploymentId },
        "admin",
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.service.createNetworkEnrollment(
        participantId,
        { deploymentId: crypto.randomUUID() },
        "admin",
      ),
    ).resolves.toMatchObject({ state: "ISSUED" });
    expect(f.client.createEnrollmentKey).toHaveBeenCalledTimes(1);
  });

  it("leaves recent reservations and reservations on another server alone", async () => {
    const f = fixture();
    await f.repositories.networkEnrollments.reserve({
      id: deploymentId,
      participantId,
      controlUrl: config.url,
      participantTag: config.participantTag,
      expiresAt: new Date(Date.now() + 900_000),
    });
    await f.service.reconcileNetwork();
    expect(f.rows.get(deploymentId)!.state).toBe("CREATING");
    f.rows.get(deploymentId)!.updated_at = new Date(0);
    f.rows.get(deploymentId)!.control_url = "https://other.example.org";
    await f.service.reconcileNetwork();
    expect(f.rows.get(deploymentId)!.state).toBe("CREATING");
  });

  it("exports only the verified node address, regardless of claimed hostnames", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    f.client.listNodes.mockResolvedValue([
      {
        id: "9",
        name: "bpnl000000000001",
        givenName: "bpnl000000000001",
        online: true,
        ipAddresses: ["100.64.0.99"],
        preAuthKey: { id: "99" },
      },
      {
        id: "2",
        name: "some-other-participant",
        givenName: "some-other-participant",
        online: true,
        ipAddresses: ["100.64.0.2"],
        preAuthKey: { id: "7" },
      },
    ]);
    expect(
      await f.service.getTunnelRoutes(`Bearer ${config.routingApiKey}`),
    ).toBe('"bpnl000000000001.tunnel.example.org" "100.64.0.2";\n');
    f.rejected.add(participantId);
    f.client.listNodes.mockRejectedValue(new Error("Headscale is unavailable"));
    expect(
      await f.service.getTunnelRoutes(`Bearer ${config.routingApiKey}`),
    ).toBe("");
  });

  it("never publishes an ambiguous or expired node", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    const node = {
      id: "2",
      name: "a",
      givenName: "a",
      online: true,
      ipAddresses: ["100.64.0.2"],
      preAuthKey: { id: "7" },
    };
    f.client.listNodes.mockResolvedValue([
      node,
      { ...node, id: "3", ipAddresses: ["100.64.0.3"] },
    ]);
    expect(
      await f.service.getTunnelRoutes(`Bearer ${config.routingApiKey}`),
    ).toBe("");
    f.client.listNodes.mockResolvedValue([
      { ...node, expiry: new Date(0).toISOString() },
    ]);
    expect(
      await f.service.getTunnelRoutes(`Bearer ${config.routingApiKey}`),
    ).toBe("");
    f.rows.get(deploymentId)!.state = "REVOKING";
    f.client.listNodes.mockRejectedValue(new Error("Headscale is unavailable"));
    expect(
      await f.service.getTunnelRoutes(`Bearer ${config.routingApiKey}`),
    ).toBe("");
  });

  it.each([
    "127.0.0.1",
    "10.0.0.2",
    "192.0.2.1",
    "100.63.255.255",
    "100.128.0.1",
    "100.64.0.2;include x",
    "::1",
  ])("does not export an unsafe destination: %s", async (address) => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    f.client.listNodes.mockResolvedValue([
      {
        id: "2",
        name: "a",
        givenName: "a",
        online: true,
        ipAddresses: [address],
        preAuthKey: { id: "7" },
      },
    ]);
    expect(
      await f.service.getTunnelRoutes(`Bearer ${config.routingApiKey}`),
    ).toBe("");
  });

  it("requires the separate read-only token before accessing routing state", async () => {
    const f = fixture();
    for (const authorization of [
      undefined,
      "",
      `Bearer ${config.apiKey}`,
      "Bearer wrong",
      config.routingApiKey,
    ]) {
      await expect(
        f.service.getTunnelRoutes(authorization),
      ).rejects.toMatchObject({ status: 401 });
    }
    expect(f.client.listNodes).not.toHaveBeenCalled();
  });

  it("returns the key once and keeps database, audit and status free of secrets", async () => {
    const f = fixture();
    const result = await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    expect(result).toMatchObject({
      authKey: "join-secret",
      deploymentId,
      state: "ISSUED",
      hostname: "bpnl000000000001",
      publicHost: "bpnl000000000001.tunnel.example.org",
      participantEnv: {
        HEADSCALE_URL: "https://headscale.example.org",
        TAILNET_HOSTNAME: "bpnl000000000001",
        PARTICIPANT_PUBLIC_HOST: "bpnl000000000001.tunnel.example.org",
        PARTICIPANT_DID_HOST: "bpnl000000000001.tunnel.example.org",
      },
    });
    const ttl = f.rows.get(deploymentId)!.expires_at.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(890000);
    expect(ttl).toBeLessThanOrEqual(900000);
    expect(f.events).toContainEqual({
      deploymentId,
      action: "participant.network_enrollment_created",
      actor: "admin",
    });
    const status = await f.service.listNetworkEnrollments(participantId);
    expect(status[0]).toMatchObject({
      connection: "AWAITING_JOIN",
      node: null,
    });
    expect(
      JSON.stringify({ rows: [...f.rows.values()], events: f.events, status }),
    ).not.toMatch(/join-secret|admin-secret/);
    await expect(
      f.service.createNetworkEnrollment(
        participantId,
        { deploymentId },
        "admin",
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.client.createEnrollmentKey).toHaveBeenCalledTimes(1);
  });

  it("issues invitation keys with the longer invitation lifetime", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId, purpose: "invitation" },
      "admin",
    );
    const ttl = f.rows.get(deploymentId)!.expires_at.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(604790000);
    expect(ttl).toBeLessThanOrEqual(604800000);
    expect(f.client.createEnrollmentKey).toHaveBeenCalledWith(
      f.rows.get(deploymentId)!.expires_at,
    );
    await expect(
      f.service.createNetworkEnrollment(
        participantId,
        { deploymentId: crypto.randomUUID(), purpose: "forever" },
        "admin",
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("keeps Headscale optional and makes no upstream or database calls when disabled", async () => {
    const f = fixture();
    const service = createNetworkEnrollmentService({
      config: { ...config, enabled: false },
      repositories: f.repositories,
      client: f.client,
    });
    expect(await service.getNetworkStatus()).toEqual({ enabled: false });
    await expect(
      service.createNetworkEnrollment(participantId, { deploymentId }, "admin"),
    ).rejects.toMatchObject({ status: 503 });
    expect(f.load).not.toHaveBeenCalled();
    expect(f.client.listNodes).not.toHaveBeenCalled();
    expect(f.client.createEnrollmentKey).not.toHaveBeenCalled();
  });

  it("requires a known, verified participant and validates IDs before minting a key", async () => {
    const f = fixture();
    await expect(
      f.service.createNetworkEnrollment("bad-id", { deploymentId }, "admin"),
    ).rejects.toMatchObject({ status: 400 });
    f.load.mockResolvedValueOnce(undefined);
    await expect(
      f.service.createNetworkEnrollment(
        participantId,
        { deploymentId },
        "admin",
      ),
    ).rejects.toMatchObject({ status: 404 });
    f.load.mockResolvedValueOnce({
      id: participantId,
      verification_status: "REJECTED",
      assigned_bpn: "BPNL000000000001",
    });
    await expect(
      f.service.createNetworkEnrollment(
        participantId,
        { deploymentId },
        "admin",
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.service.createNetworkEnrollment(
        participantId,
        { deploymentId, tags: ["tag:ingress"] },
        "admin",
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.client.createEnrollmentKey).not.toHaveBeenCalled();
  });

  it("resolves nodes by the issued key ID and ignores spoofed hostnames", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    f.client.listNodes.mockResolvedValue([
      {
        id: "1",
        name: "bpnl000000000001",
        givenName: "",
        online: true,
        ipAddresses: ["100.96.0.99"],
        preAuthKey: { id: "99" },
      },
      {
        id: "2",
        name: "actual-node",
        givenName: "",
        online: false,
        ipAddresses: ["100.96.0.2"],
        preAuthKey: { id: "7" },
      },
    ]);
    expect(
      (await f.service.listNetworkEnrollments(participantId))[0],
    ).toMatchObject({
      connection: "OFFLINE",
      node: { id: "2", ipAddresses: ["100.96.0.2"] },
    });
    f.rows.get(deploymentId)!.expires_at = new Date(0);
    expect(
      (await f.service.listNetworkEnrollments(participantId))[0].connection,
    ).toBe("OFFLINE");
    f.client.listNodes.mockResolvedValue([]);
    expect(
      (await f.service.listNetworkEnrollments(participantId))[0].connection,
    ).toBe("EXPIRED");
  });

  it("never assigns an arbitrary node when multiple peers share a key", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    f.client.listNodes.mockResolvedValue(
      ["1", "2"].map((id) => ({
        id,
        name: "",
        givenName: "",
        online: true,
        ipAddresses: [],
        preAuthKey: { id: "7" },
      })),
    );
    expect(
      (await f.service.listNetworkEnrollments(participantId))[0],
    ).toMatchObject({ connection: "AMBIGUOUS", node: null });
  });

  it("expires a newly created key if persisting its result fails", async () => {
    const f = fixture();
    vi.spyOn(
      f.repositories.networkEnrollments,
      "withLock",
    ).mockImplementationOnce(async (_p, _d, work) => {
      await work({
        row: f.rows.get(deploymentId)!,
        update: async () => {
          throw new Error("database failure");
        },
        audit: async () => {},
      });
      throw new Error("unreachable");
    });
    await expect(
      f.service.createNetworkEnrollment(
        participantId,
        { deploymentId },
        "admin",
      ),
    ).rejects.toMatchObject({ status: 502 });
    expect(f.client.expireEnrollmentKey).toHaveBeenCalledWith("7");
    expect(f.rows.get(deploymentId)).toMatchObject({
      state: "FAILED",
      pre_auth_key_id: "7",
    });
    expect(f.events).toEqual([]);
  });

  it("records an unknown creation outcome without retrying or returning upstream secrets", async () => {
    const f = fixture();
    f.client.createEnrollmentKey.mockRejectedValue(
      new Error("timeout join-secret"),
    );
    await expect(
      f.service.createNetworkEnrollment(
        participantId,
        { deploymentId },
        "admin",
      ),
    ).rejects.toMatchObject({
      status: 502,
      message: expect.not.stringContaining("join-secret"),
    });
    expect(f.rows.get(deploymentId)).toMatchObject({
      state: "FAILED",
      pre_auth_key_id: null,
    });
    expect(f.client.createEnrollmentKey).toHaveBeenCalledTimes(1);
  });

  it("revokes only peers associated with the key, including a previously unobserved peer", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    f.client.listNodes.mockResolvedValue([
      {
        id: "2",
        name: "new",
        givenName: "",
        online: true,
        ipAddresses: [],
        preAuthKey: { id: "7" },
      },
      {
        id: "3",
        name: "other",
        givenName: "",
        online: true,
        ipAddresses: [],
        preAuthKey: { id: "8" },
      },
    ]);
    expect(
      await f.service.revokeNetworkEnrollment(
        participantId,
        deploymentId,
        "admin",
      ),
    ).toMatchObject({ state: "REVOKED" });
    expect(f.client.expireEnrollmentKey).toHaveBeenCalledWith("7");
    expect(f.client.deleteNode).toHaveBeenCalledExactlyOnceWith("2");
    await f.service.revokeNetworkEnrollment(
      participantId,
      deploymentId,
      "admin",
    );
    expect(f.client.deleteNode).toHaveBeenCalledTimes(1);
  });

  it("persists revocation intent across failed cleanup so the same request can be retried", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    f.client.expireEnrollmentKey.mockRejectedValueOnce(
      new Error("upstream unavailable"),
    );
    await expect(
      f.service.revokeNetworkEnrollment(participantId, deploymentId, "admin"),
    ).rejects.toThrow();
    expect(f.rows.get(deploymentId)!.state).toBe("REVOKING");
    expect(
      await f.service.revokeNetworkEnrollment(
        participantId,
        deploymentId,
        "admin",
      ),
    ).toMatchObject({ state: "REVOKED" });
  });

  it("does not revoke IDs belonging to another server or participant", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    const row = f.rows.get(deploymentId)!;
    row.control_url = "https://previous.example.org";
    await expect(
      f.service.revokeNetworkEnrollment(participantId, deploymentId, "admin"),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await f.service.listNetworkEnrollments(participantId))[0],
    ).toMatchObject({ connection: "UNKNOWN", node: null });
    row.control_url = config.url;
    row.business_partner_id = "550e8400-e29b-41d4-a716-446655440099";
    await expect(
      f.service.revokeNetworkEnrollment(participantId, deploymentId, "admin"),
    ).rejects.toMatchObject({ status: 404 });
    expect(f.client.expireEnrollmentKey).not.toHaveBeenCalled();
  });

  it("allows only one active enrollment per participant", async () => {
    const f = fixture();
    f.repositories.networkEnrollments.reserve = vi
      .fn<NetworkEnrollmentRepository["reserve"]>()
      .mockRejectedValue(Object.assign(new Error("active"), { status: 409 }));
    await expect(
      f.service.createNetworkEnrollment(
        participantId,
        { deploymentId },
        "admin",
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.client.createEnrollmentKey).not.toHaveBeenCalled();
  });

  it("routes the bound node independently of its client-selected name", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    const node = {
      id: "2",
      name: "laptop",
      givenName: "laptop",
      online: true,
      ipAddresses: ["100.96.0.2"],
      preAuthKey: { id: "7" },
    };
    f.client.listNodes.mockResolvedValue([node]);
    expect(
      (await f.service.listNetworkEnrollments(participantId))[0].node,
    ).toMatchObject({ routable: true });
    f.client.listNodes.mockResolvedValue([
      { ...node, givenName: "bpnl000000000001" },
    ]);
    expect(
      (await f.service.listNetworkEnrollments(participantId))[0].node,
    ).toMatchObject({ routable: true });
  });

  it("assigns canonical names and moves squatters off reserved names first", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    f.client.listNodes.mockResolvedValue([
      {
        id: "5",
        name: "bpnl000000000001",
        givenName: "bpnl000000000001",
        online: true,
        ipAddresses: ["100.96.0.5"],
        preAuthKey: { id: "99" },
      },
      {
        id: "2",
        name: "laptop",
        givenName: "laptop",
        online: true,
        ipAddresses: ["100.96.0.2"],
        preAuthKey: { id: "7" },
      },
    ]);
    expect(await f.service.reconcileNodeNames()).toEqual({ renamed: 2 });
    expect(f.client.renameNode.mock.calls).toEqual([
      ["5", "txb-unverified-5"],
      ["2", "bpnl000000000001"],
    ]);
  });

  it("does not rename when the key is ambiguous or names already match", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    const base = { online: true, ipAddresses: [], preAuthKey: { id: "7" } };
    f.client.listNodes.mockResolvedValue([
      { ...base, id: "2", name: "a", givenName: "a" },
      { ...base, id: "3", name: "b", givenName: "b" },
    ]);
    expect(await f.service.reconcileNodeNames()).toEqual({ renamed: 0 });
    f.client.listNodes.mockResolvedValue([
      { ...base, id: "2", name: "a", givenName: "bpnl000000000001" },
    ]);
    expect(await f.service.reconcileNodeNames()).toEqual({ renamed: 0 });
    expect(f.client.renameNode).not.toHaveBeenCalled();
  });

  it("revokes enrollments of rejected participants on reconciliation", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    f.client.listNodes.mockResolvedValue([
      {
        id: "2",
        name: "bpnl000000000001",
        givenName: "bpnl000000000001",
        online: true,
        ipAddresses: [],
        preAuthKey: { id: "7" },
      },
    ]);
    expect(await f.service.reconcileNetwork()).toEqual({
      renamed: 0,
      revoked: 0,
      failed: 0,
    });
    expect(f.rows.get(deploymentId)!.state).toBe("ISSUED");

    f.rejected.add(participantId);
    expect(await f.service.reconcileNetwork()).toMatchObject({
      revoked: 1,
      failed: 0,
    });
    expect(f.rows.get(deploymentId)!.state).toBe("REVOKED");
    expect(f.client.expireEnrollmentKey).toHaveBeenCalledWith("7");
    expect(f.client.deleteNode).toHaveBeenCalledExactlyOnceWith("2");
    expect(f.events).toContainEqual({
      deploymentId,
      action: "participant.network_enrollment_revoked",
      actor: NETWORK_RECONCILER_ACTOR,
    });
  });

  it("retries unfinished revocations and keeps failures pending", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    f.client.expireEnrollmentKey.mockRejectedValueOnce(
      new Error("upstream unavailable"),
    );
    await expect(
      f.service.revokeNetworkEnrollment(participantId, deploymentId, "admin"),
    ).rejects.toThrow();
    expect(f.rows.get(deploymentId)!.state).toBe("REVOKING");

    f.client.expireEnrollmentKey.mockRejectedValueOnce(
      new Error("still unavailable"),
    );
    expect(await f.service.reconcileNetwork()).toMatchObject({
      revoked: 0,
      failed: 1,
    });
    expect(f.rows.get(deploymentId)!.state).toBe("REVOKING");

    expect(await f.service.reconcileNetwork()).toMatchObject({
      revoked: 1,
      failed: 0,
    });
    expect(f.rows.get(deploymentId)!.state).toBe("REVOKED");
  });

  it("flags nodes offline longer than the stale threshold", async () => {
    const f = fixture();
    await f.service.createNetworkEnrollment(
      participantId,
      { deploymentId },
      "admin",
    );
    const node = (lastSeen: string | null) => ({
      id: "2",
      name: "bpnl000000000001",
      givenName: "bpnl000000000001",
      online: false,
      ipAddresses: [],
      lastSeen,
      preAuthKey: { id: "7" },
    });
    const day = 24 * 60 * 60 * 1000;
    const connection = async (lastSeen: string | null) => {
      f.client.listNodes.mockResolvedValue([node(lastSeen)]);
      const [row] = await f.service.listNetworkEnrollments(participantId);
      return [row.connection, row.node?.lastSeen];
    };
    const recent = new Date(Date.now() - day).toISOString();
    const old = new Date(Date.now() - 8 * day).toISOString();
    expect(await connection(recent)).toEqual(["OFFLINE", recent]);
    expect(await connection(old)).toEqual(["STALE", old]);
    expect(await connection(null)).toEqual(["OFFLINE", null]);
  });
});
