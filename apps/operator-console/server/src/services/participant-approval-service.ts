import type { Config } from "../config/index.js";
import type { Repositories } from "@tx-bootstrap/core/server/db/repositories/index.js";
import { buildCredentialRequestPayload } from "@tx-bootstrap/core/server/domain/credential-request.js";
import { isValidBpn } from "@tx-bootstrap/core/server/domain/participant-mappers.js";
import type { ParticipantAccessLease } from "@tx-bootstrap/core/server/db/participant-access-lease.js";
export type SetupCheck = {
  name: string;
  // pending: still in progress and checked again later; skipped: does not
  // apply to this deployment.
  status: "ok" | "failed" | "manual" | "pending" | "skipped";
  message: string;
  retryable?: boolean;
};

const requestTimeoutMs = 15_000;
const isRetryableStatus = (status: number) => status === 429 || status >= 500;
const fetchWithTimeout = (
  url: string,
  init?: RequestInit,
  lease?: ParticipantAccessLease,
) => {
  lease?.assertActive();
  const timeout = AbortSignal.timeout(requestTimeoutMs);
  return fetch(url, {
    ...init,
    signal: lease ? AbortSignal.any([timeout, lease.signal]) : timeout,
  });
};

function credentialSubjectId(credential?: { credentialSubject?: unknown }) {
  const subject = credential?.credentialSubject;
  const first = Array.isArray(subject) ? subject[0] : subject;
  return (first as { id?: string } | undefined)?.id;
}

export function createParticipantApprovalService({
  config,
  issuerPolicyClaims,
}: {
  config: Config;
  issuerPolicyClaims: Repositories["issuerPolicyClaims"];
}) {
  const bdrsManagementUrl = config.bdrs.managementUrl;
  const bdrsApiKey = config.bdrs.apiKey;
  const issuerAdminUrl = config.issuer.adminUrl;
  const issuerIdentityUrl = config.issuer.identityUrl;
  const issuerIssuanceUrl = config.issuer.issuanceUrl;
  const issuerDid = config.issuer.did;
  const issuerContext = config.issuer.context;
  const issuerContextPathId = config.issuer.contextPathId;
  const issuerApiKeyAlias = config.issuer.apiKeyAlias;
  const issuerApiKeyVaultUrl = config.issuer.apiKeyVaultUrl;
  const issuerApiKeyVaultToken = config.issuer.apiKeyVaultToken;
  const issuerApiKeyVaultPath = config.issuer.apiKeyVaultPath;
  const issuerSuperUserApiKeyVaultPath = config.issuer.superUserApiKeyVaultPath;
  const holderAttestationId = config.issuer.holderAttestationId;
  const policyClaimsAttestationId = config.issuer.policyClaimsAttestationId;
  const credentialDefinitions = config.issuer.credentialDefinitions;
  let cachedIssuerApiKey = config.issuer.apiKey;

  return {
    buildCredentialRequest,
    requireVerifiedBusinessPartner,
    runApprovalSetup,
    runRevocation,
    runReadmission,
  };

  /**
   * Reverses the revocation's access blocks so the participant can request
   * new credentials. Revoked credentials stay revoked. Issuance reopens last:
   * if the holder cannot be restored, the BDRS entry is removed again so a
   * failed readmission leaves the participant fully revoked.
   */
  async function runReadmission({
    bpn,
    did,
    organizationName,
    lease,
  }: {
    bpn: string;
    did: string;
    organizationName: string;
    lease?: ParticipantAccessLease;
  }) {
    const bdrs = (await upsertBdrs({ bpn, did }, lease)) as SetupCheck;
    if (bdrs.status !== "ok") return [bdrs];
    const holder = await restoreIssuerHolder(bpn, did, organizationName, lease);
    lease?.assertActive();
    if (holder.status === "ok") return [bdrs, holder];
    const rollback = await removeBdrsEntry(bpn, lease);
    return [
      bdrs,
      holder,
      {
        ...rollback,
        name: "bdrs-rollback",
        message:
          rollback.status === "ok"
            ? `${bpn} removed from BDRS again`
            : `Could not remove ${bpn} from BDRS again: ${rollback.message}`,
      },
    ];
  }

  async function restoreIssuerHolder(
    bpn: string,
    did: string,
    organizationName: string,
    lease?: ParticipantAccessLease,
  ): Promise<SetupCheck> {
    const name = "issuer-holder-restore";
    const path = `${issuerParticipantPath()}/holders`;
    try {
      const current = await issuerFetch(
        "GET",
        `${path}/${encodeURIComponent(bpn)}`,
        undefined,
        lease,
      );
      if (current.status === 404) {
        const created = await issuerFetch(
          "POST",
          path,
          {
            did,
            holderId: bpn,
            name: organizationName,
            properties: {},
          },
          lease,
        );
        if (!created.ok && created.status !== 409)
          return failedResponse(name, created);
        return { name, status: "ok", message: "Holder registered" };
      }
      if (!current.ok) return failedResponse(name, current);
      const holder = (await current.json()) as {
        did?: string;
        holderName?: string;
        properties?: Record<string, unknown>;
      };
      const properties = { ...(holder.properties ?? {}) };
      delete properties.revoked;
      delete properties.originalDid;
      if (holder.did === did && !holder.properties?.revoked)
        return { name, status: "ok", message: "Holder already active" };
      const update = await issuerFetch(
        "PUT",
        path,
        {
          holderId: bpn,
          did,
          name: holder.holderName ?? organizationName,
          properties,
        },
        lease,
      );
      if (!update.ok) return failedResponse(name, update);
      return {
        name,
        status: "ok",
        message: "Holder restored; the participant can request credentials",
      };
    } catch (error) {
      lease?.assertActive();
      return {
        name,
        status: "failed",
        retryable: true,
        message: error.message,
      };
    }
  }

  /**
   * Removes a participant from the dataspace at the issuer and BDRS. Each step
   * is idempotent, so a failed revocation can simply be run again. Tunnel
   * access is removed separately by the network reconciler.
   *
   * A credential request the issuer accepted just before the block can still
   * produce a credential afterwards. Until `settled` (the revocation reconciler
   * passes it once some time has passed since the block), the credential step
   * stays pending so the scan is repeated.
   */
  async function runRevocation({
    bpn,
    did,
    settled = false,
    lease,
  }: {
    bpn: string;
    did: string;
    settled?: boolean;
    lease?: ParticipantAccessLease;
  }) {
    const checks: SetupCheck[] = [];
    checks.push(await blockIssuerHolder(bpn, lease));
    checks.push(await revokeIssuedCredentials(bpn, did, settled, lease));
    checks.push(await removeBdrsEntry(bpn, lease));
    lease?.assertActive();
    return checks;
  }

  // Participants request credentials from their own Identity Hub at any time,
  // and the issuer serves any registered holder that presents its DID. The
  // Issuer Service (0.3.x) cannot delete holders, so the holder's DID is
  // replaced with one nobody can present; the original stays in properties.
  async function blockIssuerHolder(
    bpn: string,
    lease?: ParticipantAccessLease,
  ): Promise<SetupCheck> {
    const name = "issuer-holder-block";
    const blockedDid = `did:web:revoked.invalid:${bpn}`;
    const path = `${issuerParticipantPath()}/holders`;
    try {
      const current = await issuerFetch(
        "GET",
        `${path}/${encodeURIComponent(bpn)}`,
        undefined,
        lease,
      );
      if (current.status === 404)
        return { name, status: "ok", message: "No holder registered" };
      if (!current.ok) return failedResponse(name, current);
      const holder = (await current.json()) as {
        did?: string;
        holderName?: string;
        properties?: Record<string, unknown>;
      };
      if (holder.did === blockedDid)
        return { name, status: "ok", message: "Holder already blocked" };
      const update = await issuerFetch(
        "PUT",
        path,
        {
          holderId: bpn,
          did: blockedDid,
          name: holder.holderName ?? bpn,
          properties: {
            ...(holder.properties ?? {}),
            revoked: true,
            originalDid: holder.did,
          },
        },
        lease,
      );
      if (!update.ok) return failedResponse(name, update);
      return {
        name,
        status: "ok",
        message: "Holder blocked; the issuer rejects new credential requests",
      };
    } catch (error) {
      lease?.assertActive();
      return {
        name,
        status: "failed",
        retryable: true,
        message: error.message,
      };
    }
  }

  async function revokeIssuedCredentials(
    bpn: string,
    did: string,
    settled: boolean,
    lease?: ParticipantAccessLease,
  ): Promise<SetupCheck> {
    const name = "issuer-credential-revocation";
    const base = `${issuerParticipantPath()}/credentials`;
    try {
      // Read running issuance before scanning: a process that finishes after
      // this query has stored its credential before the scan below.
      const processes = await issuerFetch(
        "POST",
        `${issuerParticipantPath()}/issuanceprocesses/query`,
        {
          offset: 0,
          limit: 1000,
          filterExpression: [
            { operandLeft: "holderId", operator: "=", operandRight: bpn },
          ],
        },
        lease,
      );
      if (!processes.ok) return failedResponse(name, processes);
      const running = (
        ((await processes.json()) ?? []) as Array<{ state?: string }>
      ).filter(
        (process) => !["DELIVERED", "ERRORED"].includes(String(process.state)),
      ).length;

      const ids: string[] = [];
      const limit = 200;
      for (let offset = 0; ; offset += limit) {
        const response = await issuerFetch(
          "POST",
          `${base}/query`,
          {
            offset,
            limit,
          },
          lease,
        );
        if (!response.ok) return failedResponse(name, response);
        const page = ((await response.json()) ?? []) as Array<{
          id: string;
          credential?: { credentialSubject?: unknown };
        }>;
        for (const entry of page) {
          if (credentialSubjectId(entry.credential) === did) ids.push(entry.id);
        }
        if (page.length < limit) break;
      }

      let revoked = 0;
      let already = 0;
      const failures: string[] = [];
      for (const id of ids) {
        const path = `${base}/${encodeURIComponent(id)}`;
        const status = await issuerFetch(
          "GET",
          `${path}/status`,
          undefined,
          lease,
        );
        if (status.ok) {
          const body = (await status.json()) as { status?: string } | string;
          const value = typeof body === "string" ? body : body?.status;
          if (value === "revocation") {
            already++;
            continue;
          }
        }
        const response = await issuerFetch("POST", `${path}/revoke`, {}, lease);
        if (response.ok) revoked++;
        else failures.push(`${id}: HTTP ${response.status}`);
      }
      const summary = `${revoked} revoked, ${already} already revoked of ${ids.length} issued to ${did}`;
      if (failures.length)
        return {
          name,
          status: "failed",
          retryable: true,
          message: `${summary}; failed: ${failures.join(", ")}`,
        };
      if (running)
        return {
          name,
          status: "pending",
          retryable: true,
          message: `${summary}; ${running} issuance(s) still running, checking again`,
        };
      if (!settled)
        return {
          name,
          status: "pending",
          retryable: true,
          message: `${summary}; checking again for late issuance`,
        };
      return { name, status: "ok", message: summary };
    } catch (error) {
      lease?.assertActive();
      return {
        name,
        status: "failed",
        retryable: true,
        message: error.message,
      };
    }
  }

  async function removeBdrsEntry(
    bpn: string,
    lease?: ParticipantAccessLease,
  ): Promise<SetupCheck> {
    const name = "bdrs-removal";
    try {
      const response = await fetchWithTimeout(
        `${bdrsManagementUrl}/bpn-directory/${encodeURIComponent(bpn)}`,
        { method: "DELETE", headers: { "x-api-key": bdrsApiKey } },
        lease,
      );
      if (response.ok || response.status === 404)
        return { name, status: "ok", message: `${bpn} removed from BDRS` };
      return failedResponse(name, response);
    } catch (error) {
      lease?.assertActive();
      return {
        name,
        status: "failed",
        retryable: true,
        message: error.message,
      };
    }
  }

  function issuerParticipantPath() {
    return `/v1alpha/participants/${encodeURIComponent(issuerContextPathId)}`;
  }

  async function failedResponse(
    name: string,
    response: Response,
  ): Promise<SetupCheck> {
    return {
      name,
      status: "failed",
      retryable: isRetryableStatus(response.status),
      message: `HTTP ${response.status}: ${(await response.text()) || "<empty>"}`,
    };
  }

  async function runApprovalSetup(row) {
    const checks: SetupCheck[] = [];
    const syntax = checkSyntax(row) as SetupCheck;
    checks.push(syntax);
    if (syntax.status !== "ok") return checks;
    const bdrs = (await upsertBdrs(row)) as SetupCheck;
    checks.push(bdrs);
    if (bdrs.status !== "ok") return checks;
    checks.push(...((await ensureIssuerSetup(row)) as SetupCheck[]));
    return checks;
  }

  function requireVerifiedBusinessPartner(row) {
    if (!row.business_partner_id || !row.bp_id) {
      const error = new Error(
        "Onboarding case is not linked to a business partner",
      );
      error.status = 409;
      throw error;
    }
    if (row.bp_verification_status !== "VERIFIED") {
      const error = new Error(
        "Business partner must be verified before automatic setup",
      );
      error.status = 409;
      throw error;
    }
    if (!row.bp_assigned_bpn) {
      const error = new Error(
        "Business partner needs an assigned BPN before automatic setup",
      );
      error.status = 409;
      throw error;
    }
    const missingTechnicalMetadata = [
      ["DID", row.did],
      ["DSP endpoint", row.dsp_endpoint],
      [
        "IdentityHub credential service endpoint",
        row.identityhub_credential_service_endpoint,
      ],
    ].filter(([, value]) => !String(value ?? "").trim());
    if (missingTechnicalMetadata.length) {
      const missingLabels = missingTechnicalMetadata
        .map(([label]) => label)
        .join(", ");
      const error = new Error(
        "Technical metadata is required before automatic setup: " +
          missingLabels,
      );
      error.status = 409;
      throw error;
    }
    return {
      ...row,
      bpn: row.bp_assigned_bpn,
      organization_name: row.bp_legal_name || row.organization_name,
    };
  }

  function checkSyntax(row) {
    const errors: string[] = [];
    if (!isValidBpn(row.bpn))
      errors.push("Assigned BPN does not look like a Catena-X-style BPN");
    if (!row.did.startsWith("did:web:")) errors.push("DID must use did:web");
    for (const [label, value] of [
      ["DSP endpoint", row.dsp_endpoint],
      [
        "IdentityHub credential service endpoint",
        row.identityhub_credential_service_endpoint,
      ],
    ]) {
      try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol)) {
          errors.push(`${label} must use HTTP or HTTPS`);
        }
      } catch {
        errors.push(`${label} must be an absolute URL`);
      }
    }
    return {
      name: "metadata-validation",
      status: errors.length ? "failed" : "ok",
      message:
        errors.join("; ") || "Participant metadata is syntactically valid",
    };
  }

  async function upsertBdrs(row, lease?: ParticipantAccessLease) {
    try {
      const response = await fetchWithTimeout(
        `${bdrsManagementUrl}/bpn-directory`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": bdrsApiKey,
          },
          body: JSON.stringify({ bpn: row.bpn, did: row.did }),
        },
        lease,
      );
      if (!response.ok && response.status !== 409) {
        return {
          name: "bdrs-registration",
          status: "failed",
          retryable: isRetryableStatus(response.status),
          message: await response.text(),
        };
      }
      return {
        name: "bdrs-registration",
        status: "ok",
        message: `${row.bpn} mapped to ${row.did}`,
      };
    } catch (error) {
      lease?.assertActive();
      return {
        name: "bdrs-registration",
        status: "failed",
        retryable: true,
        message: error.message,
      };
    }
  }

  async function ensureIssuerSetup(row) {
    const apiKeyResult = await ensureIssuerParticipant();
    if (!apiKeyResult.apiKey) {
      return [apiKeyResult.check];
    }

    const encodedIssuerContext = encodeURIComponent(issuerContextPathId);
    const checks = [apiKeyResult.check];
    checks.push(
      await postIssuer(
        "issuer-holder-attestation",
        `/v1alpha/participants/${encodedIssuerContext}/attestations`,
        {
          id: holderAttestationId,
          attestationType: "database",
          configuration: { dataSourceName: "holder", tableName: "holders" },
        },
      ),
    );
    checks.push(
      await postIssuer(
        "issuer-policy-claims-attestation",
        `/v1alpha/participants/${encodedIssuerContext}/attestations`,
        {
          id: policyClaimsAttestationId,
          attestationType: "database",
          configuration: {
            dataSourceName: "holder",
            tableName: "custom_attestation_claims",
            idColumn: "holder_id",
            required: false,
          },
        },
      ),
    );
    checks.push(await ensureIssuerPolicyClaims(row));

    for (const definition of credentialDefinitions) {
      checks.push(
        await upsertIssuer(
          `credential-definition-${definition.credentialType}`,
          `/v1alpha/participants/${encodedIssuerContext}/credentialdefinitions`,
          {
            id: definition.id,
            attestations: definition.attestations,
            credentialType: definition.credentialType,
            format: definition.format,
            jsonSchema: "{}",
            jsonSchemaUrl: "",
            mappings: definition.mappings,
            validity: 31536000,
          },
          definition.id,
        ),
      );
    }

    checks.push(
      await upsertIssuer(
        "issuer-holder-registration",
        `/v1alpha/participants/${encodedIssuerContext}/holders`,
        {
          did: row.did,
          holderId: row.bpn,
          name: row.organization_name,
          properties: {},
        },
        row.bpn,
      ),
    );
    return checks;
  }

  async function ensureIssuerPolicyClaims(row) {
    if (!issuerPolicyClaims.configured) {
      return {
        name: "issuer-policy-claims",
        status: "manual",
        message:
          "ISSUER_CLAIMS_DATABASE_URL is not configured; seed custom issuer attestation claims manually",
      };
    }

    try {
      await issuerPolicyClaims.upsert({
        bpn: row.bpn,
        memberOf: "Catena-X",
        groupName: "UseCaseFramework",
        useCase: "DataExchangeGovernance",
        contractTemplate:
          "https://catena-x.net/en/catena-x-introduce-implement/governance-framework-for-data-space-operations",
        contractVersion: "1.0",
        now: Date.now(),
      });
      return {
        name: "issuer-policy-claims",
        status: "ok",
        message: "Issuer attestation claims are ready",
      };
    } catch (error) {
      return {
        name: "issuer-policy-claims",
        status: "failed",
        retryable: true,
        message: error.message,
      };
    }
  }

  async function ensureIssuerParticipant() {
    const existingApiKey = await resolveIssuerApiKey();
    if (existingApiKey) {
      cachedIssuerApiKey = existingApiKey;
      return {
        apiKey: existingApiKey,
        check: {
          name: "issuer-participant-context",
          status: "ok",
          message: `${issuerContext} API key is available`,
        },
      };
    }

    const superUserApiKey = await resolveVaultSecret(
      issuerSuperUserApiKeyVaultPath,
    );
    if (!superUserApiKey) {
      return {
        apiKey: "",
        check: {
          name: "issuer-participant-context",
          status: "manual",
          message:
            "IssuerService super-user API key is unavailable; issuer participant setup must be completed manually.",
        },
      };
    }

    try {
      const response = await fetchWithTimeout(
        `${issuerIdentityUrl}/v1alpha/participants`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": superUserApiKey,
          },
          body: JSON.stringify({
            active: true,
            did: issuerDid,
            participantContextId: issuerContext,
            participantId: issuerContext,
            roles: ["ROLE_ADMIN", "admin"],
            serviceEndpoints: [
              {
                id: `${issuerDid}#credential-service`,
                type: "IssuerService",
                serviceEndpoint: `${issuerIssuanceUrl}/v1alpha/participants/${encodeURIComponent(
                  issuerContextPathId,
                )}`,
              },
            ],
            apiKeyAlias: issuerApiKeyAlias,
            key: {
              keyId: `${issuerDid}#key-1`,
              type: "JsonWebKey2020",
              privateKeyAlias: `${issuerContext}-issuer-key-1`,
              keyGeneratorParams: { algorithm: "Ec", curve: "secp256r1" },
            },
          }),
        },
      );

      if (response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          apiKey?: string;
        };
        cachedIssuerApiKey = payload.apiKey ?? (await resolveIssuerApiKey());
        return {
          apiKey: cachedIssuerApiKey,
          check: {
            name: "issuer-participant-context",
            status: cachedIssuerApiKey ? "ok" : "failed",
            message: cachedIssuerApiKey
              ? `${issuerContext} issuer participant created`
              : "Issuer participant was created but no API key was returned or found in Vault",
          },
        };
      }

      if (response.status === 409) {
        const apiKey = await resolveIssuerApiKey();
        cachedIssuerApiKey = apiKey;
        return {
          apiKey,
          check: {
            name: "issuer-participant-context",
            status: apiKey ? "ok" : "manual",
            message: apiKey
              ? `${issuerContext} issuer participant already exists`
              : `${issuerContext} issuer participant already exists, but its API key is not available to console`,
          },
        };
      }

      return {
        apiKey: "",
        check: {
          name: "issuer-participant-context",
          status: "failed",
          retryable: isRetryableStatus(response.status),
          message: await response.text(),
        },
      };
    } catch (error) {
      return {
        apiKey: "",
        check: {
          name: "issuer-participant-context",
          status: "failed",
          retryable: true,
          message: error.message,
        },
      };
    }
  }

  async function resolveIssuerApiKey(lease?: ParticipantAccessLease) {
    if (cachedIssuerApiKey) return cachedIssuerApiKey;
    return resolveVaultSecret(issuerApiKeyVaultPath, lease);
  }

  async function resolveVaultSecret(path, lease?: ParticipantAccessLease) {
    if (!issuerApiKeyVaultUrl || !issuerApiKeyVaultToken || !path) return "";
    const candidates = path.includes("/secret/data/data/")
      ? [path, path.replace("/secret/data/data/", "/secret/data/")]
      : [path, path.replace("/secret/data/", "/secret/data/data/")];
    for (const candidate of [...new Set(candidates)]) {
      try {
        const response = await fetchWithTimeout(
          `${issuerApiKeyVaultUrl}${candidate}`,
          {
            headers: { "X-Vault-Token": issuerApiKeyVaultToken },
          },
          lease,
        );
        if (!response.ok) continue;
        const payload = (await response.json()) as {
          data?: { data?: { content?: unknown } };
        };
        const content = payload?.data?.data?.content;
        if (typeof content === "string" && content) return content;
      } catch {
        lease?.assertActive();
        // Try the next compatible Vault path shape.
      }
    }
    return "";
  }

  async function issuerFetch(
    method: string,
    path: string,
    body?: unknown,
    lease?: ParticipantAccessLease,
  ) {
    const apiKey = await resolveIssuerApiKey(lease);
    return fetchWithTimeout(
      `${issuerAdminUrl}${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      lease,
    );
  }

  async function postIssuer(name, path, body) {
    try {
      const response = await issuerFetch("POST", path, body);
      if (response.ok || response.status === 409) {
        return {
          name,
          status: "ok",
          message: response.status === 409 ? "Already exists" : "Ready",
        };
      }
      return {
        name,
        status: "failed",
        retryable: isRetryableStatus(response.status),
        message: await response.text(),
      };
    } catch (error) {
      return {
        name,
        status: "failed",
        retryable: true,
        message: error.message,
      };
    }
  }

  async function upsertIssuer(name, path, body, resourceId) {
    try {
      const createResponse = await issuerFetch("POST", path, body);
      if (createResponse.ok) return { name, status: "ok", message: "Ready" };

      const createText = await createResponse.text();
      if (createResponse.status === 409)
        return { name, status: "ok", message: "Already exists" };

      const updateResponse = await issuerFetch(
        "PUT",
        `${path}/${encodeURIComponent(resourceId)}`,
        body,
      );
      if (updateResponse.ok)
        return {
          name,
          status: "ok",
          message: `Updated after POST HTTP ${createResponse.status}`,
        };

      const updateText = await updateResponse.text();
      return {
        name,
        status: "failed",
        retryable:
          isRetryableStatus(createResponse.status) ||
          isRetryableStatus(updateResponse.status),
        message: `POST HTTP ${createResponse.status}: ${
          createText || "<empty>"
        }; PUT HTTP ${updateResponse.status}: ${updateText || "<empty>"}`,
      };
    } catch (error) {
      return {
        name,
        status: "failed",
        retryable: true,
        message: error.message,
      };
    }
  }

  function buildCredentialRequest(holderPid) {
    return buildCredentialRequestPayload({
      issuerDid,
      holderPid,
      definitions: credentialDefinitions,
    });
  }
}
