import { afterEach, describe, expect, it, vi } from "vitest";
import { createParticipantApprovalService } from "./participant-approval-service.js";

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
        contextPathId: "context",
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
