import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import {
  credentialReceiptsReportSchema,
  technicalMetadataUpdateSchema,
} from "../../api/index.js";
import {
  normalizeTechnicalMetadataInput,
  toCaseDto,
} from "../domain/participant-mappers.js";
import type { OnboardingCaseRow } from "../db/database.js";
import { headerValue } from "../http/auth.js";
import { readJson } from "../http/body.js";
import {
  BadRequestError,
  ConflictError,
  unauthorized,
} from "../http/errors.js";
import { sendJson } from "../http/responses.js";
import { hashToken, randomToken } from "../utils/crypto.js";
import type { EmailService } from "../services/email-service.js";
import { emailTemplates } from "../services/email-templates.js";
import { buildStatusUrl } from "../utils/status-url.js";
import { encodeRegistrationToken } from "../../api/registration-token.js";

type ParsedBody = Record<string, unknown> | undefined;

type Options = {
  pool: Pool;
  emailService: EmailService;
  publicUrl: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createPublicOnboardingActions({
  pool,
  emailService,
  publicUrl,
}: Options) {
  return { handleParticipantCase, resendToken };

  async function handleParticipantCase(
    request: IncomingMessage,
    response: ServerResponse,
    id: string,
    action: string | undefined,
    _url: URL,
    body?: ParsedBody,
  ) {
    const caseId = requireUuid(id);

    if (!action && request.method === "GET") {
      const row = await loadAuthorizedCase(request, caseId);
      sendJson(response, 200, toCaseDto(row));
      return;
    }

    if (action === "technical-metadata" && request.method === "PATCH") {
      const tokenHash = requireParticipantTokenHash(request);
      const current = await loadAuthorizedCaseByHash(caseId, tokenHash);
      assertCanSubmitConnectorMetadata(current);
      const merged = normalizeTechnicalMetadataInput(
        body
          ? technicalMetadataUpdateSchema.parse(body)
          : await readJson(request, technicalMetadataUpdateSchema),
      );
      const row = await queryOne(
        pool,
        "SELECT * FROM onboarding_public_update_technical_metadata($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::uuid, $7::jsonb)",
        [
          caseId,
          tokenHash,
          merged.did,
          merged.dspEndpoint,
          merged.identityHubCredentialServiceEndpoint,
          randomUUID(),
          JSON.stringify(merged),
        ],
      );
      if (!row)
        throw new ConflictError(
          `Connector metadata cannot be updated while onboarding case is ${current.state}`,
        );
      sendJson(response, 200, toCaseDto(row));
      return;
    }

    if (action === "credential-request" && request.method === "GET") {
      const row = await loadAuthorizedCase(request, caseId);
      if (
        !["READY_FOR_PARTICIPANT", "CREDENTIALS_REQUESTED"].includes(row.state)
      ) {
        sendJson(response, 409, { error: "Onboarding case is " + row.state });
        return;
      }
      sendJson(response, 200, row.credential_request);
      return;
    }

    if (action === "credential-receipts" && request.method === "POST") {
      const tokenHash = requireParticipantTokenHash(request);
      const current = await loadAuthorizedCaseByHash(caseId, tokenHash);
      assertCanReportCredentialReceipt(current);
      const receiptReport = body
        ? credentialReceiptsReportSchema.parse(body)
        : await readJson(request, credentialReceiptsReportSchema);
      const receipt = {
        id: randomUUID(),
        receivedAt: new Date().toISOString(),
        status: receiptReport.status,
        credentials: receiptReport.credentials,
        message: receiptReport.message,
      };
      const row = await queryOne(
        pool,
        "SELECT * FROM onboarding_public_append_credential_receipt($1::uuid, $2::text, $3::jsonb, $4::uuid)",
        [caseId, tokenHash, JSON.stringify(receipt), randomUUID()],
      );
      if (!row) throw unauthorized();
      sendJson(response, 201, toCaseDto(row));
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  }

  async function resendToken(
    _request: IncomingMessage,
    response: ServerResponse,
    caseId: string,
    body?: ParsedBody,
  ) {
    requireUuid(caseId);
    const data = body || {};
    const email = String(data.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      throw new BadRequestError("Email is required");
    }

    // Query case by ID and verify email matches
    const result = await pool.query<OnboardingCaseRow>(
      "SELECT c.* FROM onboarding_cases c JOIN business_partners bp ON c.business_partner_id = bp.id WHERE c.id = $1 AND LOWER(bp.contact_email) = $2",
      [caseId, email],
    );

    if (result.rows.length === 0) {
      // Don't reveal whether case exists for security
      sendJson(response, 200, {
        message:
          "If this email matches our records, a new access link has been sent.",
      });
      return;
    }

    const row = result.rows[0];

    // Generate new token and update hash
    const newToken = randomToken();
    const newTokenHash = hashToken(newToken);

    await pool.query(
      "UPDATE onboarding_cases SET participant_token_hash = $1, updated_at = NOW() WHERE id = $2",
      [newTokenHash, caseId],
    );
    // Send email with rotated registration token
    const registrationToken = encodeRegistrationToken({
      caseId,
      participantToken: newToken,
    });
    const statusUrl = buildStatusUrl(publicUrl, registrationToken);
    const emailContent = emailTemplates.tokenResend({
      organizationName: row.organization_name,
      registrationToken,
      statusUrl,
    });

    await emailService.sendEmail({
      to: email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });

    sendJson(response, 200, {
      message:
        "If this email matches our records, a new access link has been sent.",
    });
  }

  async function loadAuthorizedCase(request: IncomingMessage, caseId: string) {
    return loadAuthorizedCaseByHash(
      caseId,
      requireParticipantTokenHash(request),
    );
  }

  async function loadAuthorizedCaseByHash(caseId: string, tokenHash: string) {
    const row = await queryOne(
      pool,
      "SELECT * FROM onboarding_public_get_onboarding_case($1::uuid, $2::text)",
      [caseId, tokenHash],
    );
    if (!row) throw unauthorized();
    return row;
  }
}

const connectorMetadataStates = new Set(["REQUESTED", "IN_REVIEW", "FAILED"]);
const credentialReceiptStates = new Set([
  "READY_FOR_PARTICIPANT",
  "CREDENTIALS_REQUESTED",
]);

function assertCanSubmitConnectorMetadata(row: OnboardingCaseRow) {
  if (!connectorMetadataStates.has(row.state) || row.setup_started_at) {
    throw new ConflictError(
      `Connector metadata cannot be submitted while onboarding case is ${row.state}`,
    );
  }
}

function assertCanReportCredentialReceipt(row: OnboardingCaseRow) {
  if (!credentialReceiptStates.has(row.state)) {
    throw new ConflictError(
      `Credential receipts cannot be reported while onboarding case is ${row.state}`,
    );
  }
}

async function queryOne(pool: Pool, query: string, params: unknown[]) {
  const { rows } = await pool.query<OnboardingCaseRow>(query, params);
  return rows[0];
}

function requireParticipantTokenHash(request: IncomingMessage) {
  const token = headerValue(request.headers["x-participant-token"]);
  if (!token) throw unauthorized();
  return hashToken(token);
}

function requireUuid(value: string) {
  if (!uuidPattern.test(value))
    throw new BadRequestError("Invalid onboarding case id");
  return value;
}
