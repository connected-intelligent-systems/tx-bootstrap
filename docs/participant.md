# Participant Runtime

Reusable Docker Compose stack for one dataspace participant: IdentityHub,
Tractus-X EDC control plane, data plane, the participant portal runtime, and
public/internal gateways. PostgreSQL and Vault are external dependencies.

## Quick Start

Run `deploy/database/participant/provision.sh` once per participant, provision
Vault, inject the required external connection variables, and then deploy the
reusable Compose artifact. The coordinated local deployment uses
`deploy/local_compose/provider/compose.yaml` and
`deploy/local_compose/consumer/compose.yaml`;
those overlays add participant-specific database provisioning and isolated
Vault services and participant-local browser/API gateways, while
`deploy/local_compose/compose.yaml` provides one PostgreSQL instance for all
local roles. The browser gateways use local-only Nginx Basic Auth.

## Participant Init

`participant-init` is a one-shot service that provisions the participant wallet before the connector starts. It uses a published helper image so this compose file can be included from an OCI registry.

It does the participant-local setup only:

- waits for IdentityHub,
- reads the seeded IdentityHub super-user API key from wallet Vault using `IDENTITYHUB_SUPERUSER_API_KEY_ALIAS` unless `IDENTITYHUB_API_KEY` is set,
- creates the IdentityHub participant context as active,
- copies the generated STS client secret and participant signing key into connector Vault.

BDRS registration, demo assets, and credential issuance stay with the operator
services or a higher-level deployment stack. The participant-side onboarding UI
lives with `apps/participant-portal`, whose Fastify backend stores local state in
PostgreSQL and serves the embedded portal after credentials are issued. Its
one-shot `participant-db-migrator` owns schema changes; the runtime login has
table DML but cannot create or alter tables.

For local init image development:

```sh
docker build -t tx-bootstrap-participant-init:local -f apps/participant-init/Dockerfile apps/participant-init
PARTICIPANT_INIT_IMAGE=tx-bootstrap-participant-init:local deploy/local_compose/scripts/up.sh
```

## Network Model

| Surface          | Compose network | Example URL                                         | Purpose                                                     |
| ---------------- | --------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| Docker-internal  | `backend`       | none                                                | Local overrides and private service traffic. No host ports. |
| Internal/company | `internal`      | `participant.internal.test`, `portal.internal.test` | Private participant APIs and the participant portal gate.   |
| Public dataspace | `public`        | `participant.external.test`                         | Public gateway routes required for federation.              |

Only gateways join the `public` network. Database clients also join `egress` so
they can reach a platform-managed PostgreSQL endpoint; database services are not
part of the reusable application network model.

## Public Routes

A participant needs one externally reachable hostname:

```env
PARTICIPANT_PUBLIC_HOST=participant.external.test
PARTICIPANT_DID_HOST=participant.external.test
```

The participant DID becomes `did:web:${PARTICIPANT_DID_HOST}:${PARTICIPANT_BPN}`.

| Public route                                               | Backend                        | Purpose                                      |
| ---------------------------------------------------------- | ------------------------------ | -------------------------------------------- |
| `/${PARTICIPANT_BPN}/did.json` and `/.well-known/did.json` | IdentityHub DID API            | DID resolution.                              |
| `/api/v1/dsp/*`                                            | EDC control plane protocol API | Dataspace Protocol callbacks.                |
| `/api/public/*`                                            | EDC data plane public API      | Public data access endpoint.                 |
| `/api/credentials/*`                                       | IdentityHub credential API     | Credential issuance and wallet interactions. |
| `/.well-known/api/*`                                       | EDC control plane version API  | Optional protocol/version discovery.         |

Do not expose EDC management, IdentityHub identity/admin APIs, Vault, or
PostgreSQL through the public hostname.

## Database configuration

IdentityHub and EDC keep their packaged startup migrations and use separate
databases. The portal uses a third database with a no-login owner role, a
migration login that is a member of that role, and a DML-only runtime login.

Required database variables are:

```text
PARTICIPANT_IDENTITYHUB_JDBC_URL
PARTICIPANT_IDENTITYHUB_DB_USER
PARTICIPANT_IDENTITYHUB_DB_PASSWORD
PARTICIPANT_EDC_JDBC_URL
PARTICIPANT_EDC_DB_USER
PARTICIPANT_EDC_DB_PASSWORD
PARTICIPANT_PORTAL_MIGRATOR_DATABASE_URL
PARTICIPANT_PORTAL_OWNER_ROLE
PARTICIPANT_PORTAL_DB_ROLE
PARTICIPANT_PORTAL_DATABASE_URL
```

Use unique database and role names per participant. Production URLs should
enable certificate and hostname verification. See
`deploy/database/README.md` for provisioning variables and the run order.

## Configuration

Most settings have local defaults in `.env.example`. These are the important deployment knobs:

| Variable                                           | Example                                              | Notes                                                                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PARTICIPANT_BPN`                                  | `BPNL00000003AYRE`                                   | Dataspace participant BPN.                                                                                                                               |
| `PARTICIPANT_BPN_BASE64`                           | `QlBOTDAwMDAwMDAzQVlSRQ==`                           | Base64 form of `PARTICIPANT_BPN`, used in credential-service URLs.                                                                                       |
| `PARTICIPANT_CONTEXT_ID`                           | `596b0330-76ec-5c8e-af01-24ba6a21d4e6`               | Connector runtime context id. Keep stable and unique per participant deployment.                                                                         |
| `IDENTITYHUB_PARTICIPANT_CONTEXT_ID`               | `BPNL00000003AYRE`                                   | Wallet participant context id. Defaults to the BPN and should usually stay aligned with `PARTICIPANT_BPN`.                                               |
| `IDENTITYHUB_SUPERUSER_API_KEY`                    | `c3VwZXItdXNlcg==.local-dev-super-user-key`          | Super-user API token passed to IdentityHub. The local overlay also seeds it into Vault; other deployments must provision the alias separately.           |
| `IDENTITYHUB_SUPERUSER_API_KEY_ALIAS`              | `super-user-apikey`                                  | Wallet Vault alias for the IdentityHub super-user API key used by `participant-init`.                                                                    |
| `PARTICIPANT_PUBLIC_HOST`                          | `participant.external.test`                          | Public hostname for DSP, credentials, DID resolution, and data-plane access.                                                                             |
| `PARTICIPANT_DID_HOST`                             | `participant.external.test`                          | Hostname encoded in the `did:web` identifier. Usually the same as `PARTICIPANT_PUBLIC_HOST`.                                                             |
| `PUBLIC_DSP_CALLBACK_ADDRESS`                      | `https://participant.external.test/api/v1/dsp`       | Public DSP callback URL.                                                                                                                                 |
| `PUBLIC_DATAPLANE_BASE_URL`                        | `https://participant.external.test/api/public/`      | Public data-plane base URL. Keep the trailing slash.                                                                                                     |
| `PUBLIC_CREDENTIAL_SERVICE_ENDPOINT`               | empty                                                | Optional. Leave empty to derive it from `PARTICIPANT_PUBLIC_HOST` and `PARTICIPANT_BPN_BASE64`.                                                          |
| `BDRS_SERVER_URL`                                  | `https://issuer.external.test/api/directory`         | Operator BDRS directory URL.                                                                                                                             |
| `ISSUER_DID_HOST`, `BPN_ISSUER`                    | `issuer.external.test`, `BPNL00000003CRHK`           | Configured issuer DID host and BPN.                                                                                                                      |
| `PARTICIPANT_PUBLIC_NETWORK`                       | `tx-bootstrap-public`                                | Shared public Docker network for the public gateway.                                                                                                     |
| `PARTICIPANT_PUBLIC_NETWORK_EXTERNAL`              | `false`                                              | Set to `true` when the public network is created outside this Compose application.                                                                       |
| `PARTICIPANT_PORTAL_BACKEND_IMAGE`                 | required                                             | Participant-owned portal runtime image. Use a release tag or digest; the local deployment sets `tx-bootstrap-participant-portal-backend:local`.          |
| `PARTICIPANT_PORTAL_INTERNAL_HOST`                 | `portal.internal.test`                               | Internal hostname for the portal backend.                                                                                                                |
| `PARTICIPANT_PORTAL_AUTH_MODE`                     | required                                             | Use `forwarded-header` behind a trusted authenticating proxy; `none` is restricted to explicitly acknowledged isolated development.                      |
| `PARTICIPANT_PORTAL_HTTPS_HEADERS`                 | `true`                                               | Enables HSTS and HTTPS-upgrade CSP behavior. Set to `false` only for an intentionally HTTP-only local environment.                                       |
| `PARTICIPANT_PORTAL_ENABLE_RATE_LIMIT`             | `true`                                               | Enables the portal-wide request rate limiter. Health probes are excluded.                                                                                |
| `PARTICIPANT_PORTAL_RATE_LIMIT_MAX`                | `300`                                                | Maximum requests accepted from one client within the configured rate-limit window.                                                                       |
| `PARTICIPANT_PORTAL_RATE_LIMIT_WINDOW`             | `1 minute`                                           | Fastify rate-limit window for participant portal requests.                                                                                               |
| `PARTICIPANT_PORTAL_UPSTREAM_TIMEOUT_MS`           | `10000`                                              | Maximum duration in milliseconds for portal requests to EDC, IdentityHub, Vault, the operator, and transfer data endpoints.                              |
| `PARTICIPANT_PORTAL_PREVIEW_ALLOWED_PRIVATE_HOSTS` | empty                                                | Comma-separated exact hostnames that may resolve to private addresses during transfer preview or download. Use only for trusted internal/local gateways. |
| `PARTICIPANT_PORTAL_DOWNLOAD_TIMEOUT_MS`           | `300000`                                             | Maximum duration in milliseconds for a streamed transfer download.                                                                                       |
| `PARTICIPANT_PORTAL_ALLOW_INSECURE_AUTH`           | `false`                                              | Must be `true` to acknowledge `PARTICIPANT_PORTAL_AUTH_MODE=none` in a production runtime; never enable on a reachable deployment.                       |
| `PORTAL_TITLE`                                     | `Participant Portal`                                 | Title written into the portal runtime config.                                                                                                            |
| `ONBOARDING_DATASPACE_ADMIN_API_URL`               | `http://operator-onboarding-service:3000/api`        | Operator onboarding service.                                                                                                                             |
| `ONBOARDING_REGISTRATION_TOKEN`                    | `eyJjYX...`                                          | Operator-created registration token for config-driven gateway automation. Keep it secret.                                                                |
| `ONBOARDING_ORGANIZATION_NAME`                     | `Example Participant`                                | Fallback organization name shown by the gateway when the operator case has not been fetched yet.                                                         |
| `ONBOARDING_REQUESTED_BPN`                         | `BPNL00000003AYRE`                                   | Fallback requested or assigned BPN shown before the operator case is available.                                                                          |
| `ONBOARDING_CONTACT_EMAIL`                         | `ops@example.test`                                   | Fallback contact email shown before the operator case is available.                                                                                      |
| `ONBOARDING_DID`                                   | `did:web:participant.external.test:BPNL00000003AYRE` | DID metadata patched into the operator case after the participant stack starts.                                                                          |
| `ONBOARDING_DSP_ENDPOINT`                          | `https://participant.external.test/api/v1/dsp`       | Public DSP endpoint patched into the operator case.                                                                                                      |
| `ONBOARDING_CREDENTIAL_SERVICE_ENDPOINT`           | `https://participant.external.test/api/credentials`  | Public credential service metadata patched into the operator case.                                                                                       |

`PARTICIPANT_INTERNAL_HOST` names the private gateway for company/VPN/local-only access to management and identity APIs.

## Participant Portal

The internal gateway routes `/` to the participant portal runtime service (`participant-portal-backend` in compose for compatibility). With `ONBOARDING_REGISTRATION_TOKEN` set, the backend attaches to the existing operator case, publishes DID/DSP/credential-service metadata, waits while the operator services provision BDRS and issuer state automatically, requests credentials, reports credential receipts, and then serves the embedded portal app. Internal automation can also attach the same operator invite by posting `registrationToken` to `/api/onboarding/attach`.

Without a configured or attached registration token, the backend cannot start onboarding. It shows a missing-invite status until the operator-created value is supplied.

The participant portal runtime is internal-only by default. It is not connected to the public gateway and does not bind a separate portal host port.

### API descriptions

Asset metadata may contain one OpenAPI 3.x description uploaded as JSON or YAML. The portal stores the normalized OpenAPI document directly as metadata, not as an executable endpoint description. `servers`, operation-level server overrides, API security declarations, callbacks, webhooks, external references, and external documentation values are removed. After a consumer receives access, the backend binds the document to the negotiated data-plane endpoint. Swagger requests receive the transfer authorization header only when their final URL remains within that endpoint path.

## Production Onboarding Sequence

1. Let the operator create the participant invite in the operator console.
2. Use the BPN assigned during participant creation.
3. Start this participant stack with `PARTICIPANT_BPN` and `ONBOARDING_REGISTRATION_TOKEN` from the operator.
4. Open the internal participant portal runtime. It attaches to the case and patches the participant DID, DSP endpoint, and credential-service endpoint.
5. The operator services validate the submitted metadata and provision BDRS and issuer state automatically. The participant portal backend then requests credentials from the local IdentityHub and opens the portal when the case is active.

## Development

For participant portal package checks:

```sh
npm install
npm run build --workspace @tx-bootstrap/participant-portal
npm run lint --workspace @tx-bootstrap/participant-portal
```

For the coordinated local stack:

```sh
deploy/local_compose/scripts/up.sh
deploy/local_compose/scripts/bootstrap.sh
deploy/local_compose/scripts/e2e.sh
```

Useful local checks after the stack is up:

```sh
curl -u admin:local-admin-password http://localhost:29283/health
curl -u admin:local-admin-password \
  http://localhost:29283/api/onboarding/state | jq .
```

The provider scoped machine API is published separately on
`http://localhost:29282`; the consumer equivalent uses port `19282`. These
gateways expose only `/api/management` and `/api/federated-catalog` and require
an issued `txb_` bearer token. The raw internal gateway is not published by the
local overlays.

To test the production participant portal image directly:

```sh
docker build -t tx-bootstrap-participant-portal-backend:local -f apps/participant-portal/Dockerfile .
PARTICIPANT_PORTAL_BACKEND_IMAGE=tx-bootstrap-participant-portal-backend:local deploy/local_compose/scripts/up.sh
```
