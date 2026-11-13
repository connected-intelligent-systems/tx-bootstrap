import { afterEach, describe, expect, it, vi } from "vitest";
import { createParticipantApprovalService } from "./participant-approval-service.js";
import { ParticipantLeaseLostError } from "@tx-bootstrap/core/server/db/participant-access-lease.js";

function accessLease() {
  const controller = new AbortController();
  return {
    controller,
    lease: {
      token: "lease-1",
      signal: controller.signal,
      assertActive: () => controller.signal.throwIfAborted(),
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("participant approval service automatic checks", () => {
  it("fails syntax before writing BDRS or issuer state", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();

    const checks = await service.runApprovalSetup(
      verifiedCase({ did: "did:key:participant" }),
    );

    expect(checks).toEqual([
      expect.objectContaining({
        name: "metadata-validation",
        status: "failed",
      }),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks transient BDRS responses retryable and stops issuer setup", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();

    const checks = await service.runApprovalSetup(verifiedCase());

    expect(checks.at(-1)).toMatchObject({
      name: "bdrs-registration",
      status: "failed",
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns missing issuer configuration as a terminal manual check", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();

    const checks = await service.runApprovalSetup(verifiedCase());

    expect(checks.at(-1)).toMatchObject({
      name: "issuer-participant-context",
      status: "manual",
    });
  });
});

describe("participant revocation", () => {
  const did = "did:web:participant.example:BPNL000000000001";
  const base =
    "https://issuer.example/api/admin/v1alpha/participants/BPNL000000000099";

  function issuerMock({
    holderDid = did,
    credentials = [
      { id: "cred-1", credential: { credentialSubject: { id: did } } },
      { id: "cred-2", credential: { credentialSubject: [{ id: did }] } },
      {
        id: "other",
        credential: { credentialSubject: { id: "did:web:other" } },
      },
    ],
    statuses = {} as Record<string, string>,
    bdrsStatus = 204,
    processes = [{ holderId: "BPNL000000000001", state: "DELIVERED" }] as Array<
      Record<string, string>
    >,
  } = {}) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { status: 200 });
      if (url === `${base}/holders/BPNL000000000001` && method === "GET")
        return json({
          holderId: "BPNL000000000001",
          did: holderDid,
          holderName: "P",
          properties: {},
        });
      if (url === `${base}/holders` && method === "PUT")
        return new Response("", { status: 200 });
      if (url === `${base}/credentials/query`) return json(credentials);
      if (url === `${base}/issuanceprocesses/query`) {
        const filter = JSON.parse(String(init?.body)).filterExpression[0];
        return json(
          processes.filter(
            (process) => process[filter.operandLeft] === filter.operandRight,
          ),
        );
      }
      const status = url.match(/credentials\/([^/]+)\/status$/);
      if (status) return json({ status: statuses[status[1]] ?? "active" });
      if (url.endsWith("/revoke")) return new Response(null, { status: 204 });
      if (url.startsWith("https://bdrs.example"))
        return new Response(bdrsStatus === 204 ? null : "", {
          status: bdrsStatus,
        });
      return new Response("unexpected", { status: 500 });
    });
  }

  it("blocks the holder, revokes the participant's credentials and removes BDRS", async () => {
    const fetchMock = issuerMock();
    vi.stubGlobal("fetch", fetchMock);

    const checks = await createService().runRevocation({
      bpn: "BPNL000000000001",
      did,
      settled: true,
    });

    expect(checks.map((check) => [check.name, check.status])).toEqual([
      ["issuer-holder-block", "ok"],
      ["issuer-credential-revocation", "ok"],
      ["bdrs-removal", "ok"],
    ]);
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({
      holderId: "BPNL000000000001",
      did: "did:web:revoked.invalid:BPNL000000000001",
      properties: { revoked: true, originalDid: did },
    });
    const revoked = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.endsWith("/revoke"));
    expect(revoked).toEqual([
      `${base}/credentials/cred-1/revoke`,
      `${base}/credentials/cred-2/revoke`,
    ]);
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url ===
            "https://bdrs.example/api/management/bpn-directory/BPNL000000000001" &&
          init?.method === "DELETE",
      ),
    ).toBe(true);
  });

  it("is idempotent when everything is already revoked", async () => {
    const fetchMock = issuerMock({
      holderDid: "did:web:revoked.invalid:BPNL000000000001",
      statuses: { "cred-1": "revocation", "cred-2": "revocation" },
      bdrsStatus: 404,
    });
    vi.stubGlobal("fetch", fetchMock);

    const checks = await createService().runRevocation({
      bpn: "BPNL000000000001",
      did,
      settled: true,
    });

    expect(checks.every((check) => check.status === "ok")).toBe(true);
    expect(checks[1].message).toContain("0 revoked, 2 already revoked");
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          init?.method === "PUT" || String(url).endsWith("/revoke"),
      ),
    ).toBe(false);
  });

  it("reports a failed step as retryable and still runs the others", async () => {
    vi.stubGlobal("fetch", issuerMock({ bdrsStatus: 503 }));

    const checks = await createService().runRevocation({
      bpn: "BPNL000000000001",
      did,
      settled: true,
    });

    expect(checks[0].status).toBe("ok");
    expect(checks[1].status).toBe("ok");
    expect(checks[2]).toMatchObject({
      name: "bdrs-removal",
      status: "failed",
      retryable: true,
    });
  });

  it("keeps the credential step pending while issuance is still running", async () => {
    vi.stubGlobal(
      "fetch",
      issuerMock({
        processes: [
          { holderId: "BPNL000000000001", state: "DELIVERED" },
          { holderId: "BPNL000000000001", state: "APPROVED" },
          { holderId: "BPNL000000000002", state: "SUBMITTED" },
        ],
      }),
    );

    const checks = await createService().runRevocation({
      bpn: "BPNL000000000001",
      did,
      settled: true,
    });

    expect(checks[1]).toMatchObject({
      name: "issuer-credential-revocation",
      status: "pending",
    });
    expect(checks[1].message).toContain("1 issuance(s) still running");
  });

  it("scans again until the revocation has settled", async () => {
    vi.stubGlobal("fetch", issuerMock());

    const checks = await createService().runRevocation({
      bpn: "BPNL000000000001",
      did,
    });

    expect(checks[1]).toMatchObject({
      status: "pending",
      message: expect.stringContaining("checking again for late issuance"),
    });
  });

  it("stops the credential scan and remaining writes when its lease is lost", async () => {
    const { controller, lease } = accessLease();
    const respond = issuerMock();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/status")) {
        controller.abort(new ParticipantLeaseLostError());
      }
      return respond(url, init);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createService().runRevocation({
        bpn: "BPNL000000000001",
        did,
        settled: true,
        lease,
      }),
    ).rejects.toBeInstanceOf(ParticipantLeaseLostError);
    expect(
      fetchMock.mock.calls.some(
        ([url]) =>
          url.endsWith("/revoke") || url.startsWith("https://bdrs.example"),
      ),
    ).toBe(false);
    expect(fetchMock.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true);
  });
});

describe("participant readmission", () => {
  const did = "did:web:participant.example:BPNL000000000001";
  const base =
    "https://issuer.example/api/admin/v1alpha/participants/BPNL000000000099";

  function mock(
    holder: Record<string, unknown> | null,
    { bdrsStatus = 200, holderUpdateStatus = 200 } = {},
  ) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url === `${base}/holders/BPNL000000000001` && method === "GET")
        return holder
          ? new Response(JSON.stringify(holder), { status: 200 })
          : new Response("", { status: 404 });
      if (url === `${base}/holders`)
        return new Response("", {
          status: method === "POST" ? 201 : holderUpdateStatus,
        });
      if (url.startsWith("https://bdrs.example"))
        return new Response(method === "DELETE" ? null : "", {
          status: method === "DELETE" ? 204 : bdrsStatus,
        });
      return new Response("unexpected", { status: 500 });
    });
  }
  const blockedHolder = {
    did: "did:web:revoked.invalid:BPNL000000000001",
    holderName: "P",
    properties: { revoked: true, originalDid: did, region: "eu" },
  };

  it("restores the blocked holder DID and the BDRS entry", async () => {
    const fetchMock = mock(blockedHolder);
    vi.stubGlobal("fetch", fetchMock);

    const checks = await createService().runReadmission({
      bpn: "BPNL000000000001",
      did,
      organizationName: "P GmbH",
    });

    expect(checks.map((check) => [check.name, check.status])).toEqual([
      ["bdrs-registration", "ok"],
      ["issuer-holder-restore", "ok"],
    ]);
    const put = fetchMock.mock.calls.find(
      ([url, init]) => url === `${base}/holders` && init?.method === "PUT",
    );
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({
      holderId: "BPNL000000000001",
      did,
      name: "P",
      properties: { region: "eu" },
    });
  });

  it("registers the holder again when it is missing", async () => {
    const fetchMock = mock(null);
    vi.stubGlobal("fetch", fetchMock);

    const checks = await createService().runReadmission({
      bpn: "BPNL000000000001",
      did,
      organizationName: "P GmbH",
    });

    expect(checks[1]).toMatchObject({
      status: "ok",
      message: "Holder registered",
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url === `${base}/holders` && init?.method === "POST",
      ),
    ).toBe(true);
  });

  it("keeps issuance blocked when BDRS cannot be restored", async () => {
    const fetchMock = mock(blockedHolder, { bdrsStatus: 503 });
    vi.stubGlobal("fetch", fetchMock);

    const checks = await createService().runReadmission({
      bpn: "BPNL000000000001",
      did,
      organizationName: "P GmbH",
    });

    expect(checks.map((check) => [check.name, check.status])).toEqual([
      ["bdrs-registration", "failed"],
    ]);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/holders")),
    ).toBe(false);
  });

  it("removes the BDRS entry again when the holder cannot be restored", async () => {
    const fetchMock = mock(blockedHolder, { holderUpdateStatus: 503 });
    vi.stubGlobal("fetch", fetchMock);

    const checks = await createService().runReadmission({
      bpn: "BPNL000000000001",
      did,
      organizationName: "P GmbH",
    });

    expect(checks.map((check) => [check.name, check.status])).toEqual([
      ["bdrs-registration", "ok"],
      ["issuer-holder-restore", "failed"],
      ["bdrs-rollback", "ok"],
    ]);
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe("DELETE");
  });

  it("aborts an in-flight request and skips restoration and rollback after lease loss", async () => {
    const { controller, lease } = accessLease();
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(init!.signal!.reason),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = createService().runReadmission({
      bpn: "BPNL000000000001",
      did,
      organizationName: "P",
      lease,
    });
    const rejected = expect(result).rejects.toBeInstanceOf(
      ParticipantLeaseLostError,
    );

    controller.abort(new ParticipantLeaseLostError());

    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});

function createService() {
  return createParticipantApprovalService({
    config: {
      bdrs: {
        managementUrl: "https://bdrs.example/api/management",
        apiKey: "secret",
      },
      issuer: {
        adminUrl: "https://issuer.example/api/admin",
        identityUrl: "https://issuer.example/api/identity",
        issuanceUrl: "https://issuer.example/api/issuance",
        did: "did:web:issuer.example",
        context: "BPNL000000000099",
        apiKey: "",
        apiKeyAlias: "issuer-key",
        apiKeyVaultUrl: "",
        apiKeyVaultToken: "",
        apiKeyVaultPath: "",
        superUserApiKeyVaultPath: "",
        databaseUrl: "",
        holderAttestationId: "holder",
        policyClaimsAttestationId: "claims",
        credentialDefinitions: [],
      },
    } as never,
    issuerPolicyClaims: {
      configured: false,
      upsert: vi.fn(),
    } as never,
  });
}

function verifiedCase(overrides: Record<string, unknown> = {}) {
  return {
    id: "case-1",
    business_partner_id: "partner-1",
    bp_id: "partner-1",
    bp_verification_status: "VERIFIED",
    bp_assigned_bpn: "BPNL000000000001",
    bp_legal_name: "Example GmbH",
    organization_name: "Example GmbH",
    bpn: "BPNL000000000001",
    did: "did:web:participant.example",
    dsp_endpoint: "https://participant.example/api/dsp",
    identityhub_credential_service_endpoint:
      "https://participant.example/api/credentials",
    ...overrides,
  };
}
