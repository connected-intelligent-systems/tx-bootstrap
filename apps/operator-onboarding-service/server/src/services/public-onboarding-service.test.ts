import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { hashToken } from "@tx-bootstrap/core/server/utils/crypto.js";
import { decodeRegistrationToken } from "@tx-bootstrap/core/api/registration-token.js";
import type { EmailService } from "@tx-bootstrap/core/server/services/email-service.js";
import { credentialDefinitions } from "@tx-bootstrap/core/server/domain/credential-definitions.js";
import type { Config } from "../config/index.js";
import { createPublicOnboardingService } from "./public-onboarding-service.js";

describe("public onboarding service", () => {
  it("stores credential receipts through the public DB function without activating the onboarding case", async () => {
    const token = "participant-secret";
    const row = onboardingCaseRow({ participant_token_hash: hashToken(token) });
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("onboarding_public_get_onboarding_case"))
        return { rows: [row] };
      if (sql.includes("onboarding_public_append_credential_receipt")) {
        return {
          rows: [
            { ...row, credential_receipts: [JSON.parse(String(params[2]))] },
          ],
        };
      }
      throw new Error("Unexpected query: " + sql);
    });
    const pool = { query } as unknown as Pool;
    const emailService = {
      sendEmail: vi.fn().mockResolvedValue(true),
      verify: vi.fn().mockResolvedValue(true),
    } as unknown as EmailService;
    const service = createPublicOnboardingService({
      config: testConfig,
      pool,
      emailService,
    });
    const response = responseRecorder();

    await service.handleParticipantCase(
      {
        method: "POST",
        headers: { "x-participant-token": token },
      } as unknown as IncomingMessage,
      response.raw,
      row.id,
      "credential-receipts",
      new URL(
        "http://example.test/api/onboarding-cases/" +
          row.id +
          "/credential-receipts",
      ),
      {
        status: "issued",
        credentials: [],
        message: "Found in local IdentityHub.",
      },
    );

    const appendCall = query.mock.calls.find(([sql]) =>
      String(sql).includes("onboarding_public_append_credential_receipt"),
    );
    expect(appendCall).toBeTruthy();
    expect(appendCall?.[1]).toHaveLength(4);
    expect(appendCall?.[1]?.[1]).toBe(hashToken(token));
    expect(response.statusCode).toBe(201);
    expect(response.json().state).toBe("READY_FOR_PARTICIPANT");
    expect(response.json().credentialReceipts).toHaveLength(1);
  });

  it("rejects credential receipts before connector setup is approved", async () => {
    const token = "participant-secret";
    const row = onboardingCaseRow({
      participant_token_hash: hashToken(token),
      state: "REQUESTED",
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("onboarding_public_get_onboarding_case"))
        return { rows: [row] };
      if (sql.includes("onboarding_public_append_credential_receipt"))
        return { rows: [{ ...row, credential_receipts: [] }] };
      throw new Error("Unexpected query: " + sql);
    });
    const emailService = {
      sendEmail: vi.fn().mockResolvedValue(true),
      verify: vi.fn().mockResolvedValue(true),
    } as unknown as EmailService;
    const service = createPublicOnboardingService({
      config: testConfig,
      pool: { query } as unknown as Pool,
      emailService,
    });

    await expect(
      service.handleParticipantCase(
        {
          method: "POST",
          headers: { "x-participant-token": token },
        } as unknown as IncomingMessage,
        responseRecorder().raw,
        row.id,
        "credential-receipts",
        new URL(
          "http://example.test/api/onboarding-cases/" +
            row.id +
            "/credential-receipts",
        ),
        {
          status: "issued",
          credentials: [],
          message: "Found in local IdentityHub.",
        },
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("onboarding_public_append_credential_receipt"),
      ),
    ).toBe(false);
  });

  it("rejects connector metadata updates after automatic setup completes", async () => {
    const token = "participant-secret";
    const row = onboardingCaseRow({
      participant_token_hash: hashToken(token),
      state: "READY_FOR_PARTICIPANT",
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("onboarding_public_get_onboarding_case"))
        return { rows: [row] };
      if (sql.includes("onboarding_public_update_technical_metadata"))
        return { rows: [{ ...row }] };
      throw new Error("Unexpected query: " + sql);
    });
    const emailService = {
      sendEmail: vi.fn().mockResolvedValue(true),
      verify: vi.fn().mockResolvedValue(true),
    } as unknown as EmailService;
    const service = createPublicOnboardingService({
      config: testConfig,
      pool: { query } as unknown as Pool,
      emailService,
    });

    await expect(
      service.handleParticipantCase(
        {
          method: "PATCH",
          headers: { "x-participant-token": token },
        } as unknown as IncomingMessage,
        responseRecorder().raw,
        row.id,
        "technical-metadata",
        new URL(
          "http://example.test/api/onboarding-cases/" +
            row.id +
            "/technical-metadata",
        ),
        {
          did: "did:web:participant.example:BPNL00000003CRHK",
          dspEndpoint: "https://participant.example/api/v1/dsp",
          identityHubCredentialServiceEndpoint:
            "https://participant.example/api/credentials",
        },
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("onboarding_public_update_technical_metadata"),
      ),
    ).toBe(false);
  });
  it("rejects connector metadata updates while automatic setup holds a lease", async () => {
    const token = "participant-secret";
    const row = onboardingCaseRow({
      participant_token_hash: hashToken(token),
      state: "IN_REVIEW",
      setup_started_at: "2026-07-10T12:00:00.000Z",
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("onboarding_public_get_onboarding_case")) {
        return { rows: [row] };
      }
      throw new Error("Unexpected query: " + sql);
    });
    const service = createPublicOnboardingService({
      config: testConfig,
      pool: { query } as unknown as Pool,
      emailService: {
        sendEmail: vi.fn(),
        verify: vi.fn(),
      } as unknown as EmailService,
    });

    await expect(
      service.handleParticipantCase(
        {
          method: "PATCH",
          headers: { "x-participant-token": token },
        } as unknown as IncomingMessage,
        responseRecorder().raw,
        row.id,
        "technical-metadata",
        new URL("http://example.test"),
        {
          did: "did:web:participant.example",
          dspEndpoint: "https://participant.example/api/dsp",
          identityHubCredentialServiceEndpoint:
            "https://participant.example/api/credentials",
        },
      ),
    ).rejects.toMatchObject({ status: 409 });

    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("onboarding_public_update_technical_metadata"),
      ),
    ).toBe(false);
  });

  it("rotates registration tokens and invalidates the previous participant secret", async () => {
    const oldToken = "participant-secret";
    const row = onboardingCaseRow({
      participant_token_hash: hashToken(oldToken),
    });
    let updateParams: unknown[] | undefined;
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("SELECT c.* FROM onboarding_cases"))
        return { rows: [row] };
      if (sql.includes("UPDATE onboarding_cases")) {
        updateParams = params;
        return { rows: [] };
      }
      throw new Error("Unexpected query: " + sql);
    });
    const sendEmail = vi.fn().mockResolvedValue(true);
    const emailService = {
      sendEmail,
      verify: vi.fn().mockResolvedValue(true),
    } as unknown as EmailService;
    const service = createPublicOnboardingService({
      config: testConfig,
      pool: { query } as unknown as Pool,
      emailService,
    });

    await service.resendToken(
      {} as IncomingMessage,
      responseRecorder().raw,
      row.id,
      { email: "ops@example.test" },
    );

    expect(updateParams?.[0]).not.toBe(hashToken(oldToken));
    const email = sendEmail.mock.calls[0]?.[0] as { text: string };
    const token = email.text.match(/Registration token: ([^\s]+)/)?.[1];
    expect(token).toBeTruthy();
    const decoded = decodeRegistrationToken(String(token));
    expect(decoded.caseId).toBe(row.id);
    expect(updateParams?.[0]).toBe(hashToken(decoded.participantToken));
  });
  it("queues authenticated technical metadata for automatic setup", async () => {
    const token = "participant-secret";
    const row = onboardingCaseRow({
      participant_token_hash: hashToken(token),
      state: "REQUESTED",
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("onboarding_public_get_onboarding_case")) {
        return { rows: [row] };
      }
      if (sql.includes("onboarding_public_update_technical_metadata")) {
        return {
          rows: [
            {
              ...row,
              state: "IN_REVIEW",
              setup_attempt_count: 0,
              setup_started_at: null,
            },
          ],
        };
      }
      throw new Error("Unexpected query: " + sql);
    });
    const service = createPublicOnboardingService({
      config: testConfig,
      pool: { query } as unknown as Pool,
      emailService: {
        sendEmail: vi.fn(),
        verify: vi.fn(),
      } as unknown as EmailService,
    });
    const response = responseRecorder();

    await service.handleParticipantCase(
      {
        method: "PATCH",
        headers: { "x-participant-token": token },
      } as unknown as IncomingMessage,
      response.raw,
      row.id,
      "technical-metadata",
      new URL("http://example.test"),
      {
        did: "did:web:participant.example",
        dspEndpoint: "https://participant.example/api/dsp",
        identityHubCredentialServiceEndpoint:
          "https://participant.example/api/credentials",
      },
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().state).toBe("IN_REVIEW");
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("onboarding_public_update_technical_metadata"),
      ),
    ).toBe(true);
  });

  it("rejects non-did:web metadata before it is queued", async () => {
    const token = "participant-secret";
    const row = onboardingCaseRow({
      participant_token_hash: hashToken(token),
      state: "REQUESTED",
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("onboarding_public_get_onboarding_case")) {
        return { rows: [row] };
      }
      throw new Error("Unexpected query: " + sql);
    });
    const service = createPublicOnboardingService({
      config: testConfig,
      pool: { query } as unknown as Pool,
      emailService: {
        sendEmail: vi.fn(),
        verify: vi.fn(),
      } as unknown as EmailService,
    });

    await expect(
      service.handleParticipantCase(
        {
          method: "PATCH",
          headers: { "x-participant-token": token },
        } as unknown as IncomingMessage,
        responseRecorder().raw,
        row.id,
        "technical-metadata",
        new URL("http://example.test"),
        {
          did: "did:key:participant",
          dspEndpoint: "https://participant.example/api/dsp",
          identityHubCredentialServiceEndpoint:
            "https://participant.example/api/credentials",
        },
      ),
    ).rejects.toBeTruthy();

    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("onboarding_public_update_technical_metadata"),
      ),
    ).toBe(false);
  });
});

function onboardingCaseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    participant_token_hash: "",
    business_partner_id: "00000000-0000-4000-8000-000000000002",
    organization_name: "Example GmbH",
    requested_bpn: "",
    bpn: "",
    did: "did:web:participant.example:BPNL00000003CRHK",
    dsp_endpoint: "https://participant.example/api/v1/dsp",
    identityhub_credential_service_endpoint:
      "https://participant.example/api/credentials",
    contact_email: "ops@example.test",
    requested_role: "participant",
    state: "READY_FOR_PARTICIPANT",
    admin_notes: "",
    rejection_reason: "",
    issuer_did: "did:web:issuer.example:BPNL00000003CRHK",
    credential_request: {
      issuerDid: "did:web:issuer.example:BPNL00000003CRHK",
      holderPid: "",
      credentials: [],
    },
    setup_checks: [],
    credential_receipts: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function responseRecorder() {
  let statusCode = 0;
  let body = "";
  const headers: Record<string, string | number | readonly string[]> = {};
  const raw = {
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name] = value;
    },
    writeHead(status: number) {
      statusCode = status;
    },
    end(payload: string) {
      body = payload;
    },
  } as unknown as ServerResponse;

  return {
    raw,
    headers,
    get statusCode() {
      return statusCode;
    },
    json() {
      return JSON.parse(body) as Record<string, unknown>;
    },
  };
}

const testConfig = {
  port: 0,
  logLevel: "fatal",
  corsOrigins: ["*"],
  enableRateLimit: false,
  rateLimit: { max: 10, timeWindow: "1 minute" },
  database: { url: "" },
  issuer: { did: "did:web:issuer:BPNL00000003CRHK", credentialDefinitions },
  email: {
    enabled: false,
    host: "localhost",
    port: 587,
    secure: false,
    user: "",
    pass: "",
    from: "test@test.com",
    fromName: "Test",
  },
  publicUrl: "http://localhost:3010",
} as Config;
