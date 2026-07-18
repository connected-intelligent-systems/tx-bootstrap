# Operator Services

Reusable Docker Compose stack for operator services: issuer IdentityHub, issuer
service, BDRS, an internal operator console, and a public operator onboarding
service. PostgreSQL and Vault are external dependencies.

## Quick Start

Provision PostgreSQL with `deploy/database/operator/provision.sh`, provision
Vault, inject the required external connection variables, then deploy the
reusable Compose artifact. For a self-contained development environment, use
the coordinated `deploy/local_compose/scripts/up.sh` deployment. Its operator
overlays add database provisioning and a local Vault, while
`deploy/local_compose/compose.yaml`
provides the shared local PostgreSQL instance.

## Images

The coordinated local deployment builds the in-repo operator images through `deploy/local_compose/scripts/up.sh`. Published image and compose references can be supplied through the variables in `deploy/local_compose/local.env.example`.

## Services

`operator-console` runs the authenticated operator UI/API and the privileged automatic setup worker for BDRS registration, issuer setup, retry handling, and credential request preparation. It is loopback-published for local development:

```text
http://127.0.0.1:39080
```

`operator-onboarding-service` exposes public onboarding API endpoints under `/api/onboarding-cases...` plus `/api/health`. This API-only service provides registration, status, technical metadata, credential request retrieval, and credential receipts. Participant UIs should call these endpoints from the participant's own portal. Local loopback port:

```text
http://127.0.0.1:39085
```

`db-migrator` runs ordered SQL migrations from `db/migrations` once before the
two Node services start. It connects only to `dataspace_admin`, sets a no-login
owner role, and uses advisory locking, checksums, and per-file transactions.
The operator console has table DML through the `operator_console` group role;
the onboarding login has no direct table access and can execute only its
security-definer database API.

IdentityHub, Issuer Service, and BDRS continue to run their packaged schema
migrations during startup, each in a dedicated database. `issuer-claims-grant`
waits for Issuer Service readiness and gives a separate console login only the
three operations required on `custom_attestation_claims`.

## Security Boundary

Keep these public, normally behind TLS and rate limiting:

| Route                                        | Backend                            | Purpose                                                         |
| -------------------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| `/api/onboarding-cases*`                     | `operator-onboarding-service:3000` | Participant registration and onboarding case updates (API only) |
| `/.well-known/did.json` and issuer DID paths | `issuer-did:80`                    | Resolves `did:web:${ISSUER_DID_HOST}:${BPN_ISSUER}`             |
| `/statuslist/*`                              | `issuer-did:80`                    | Credential revocation/status list retrieval                     |
| `/api/directory/*`                           | `issuer-did:80`                    | BDRS lookup used by participants                                |
| `/.well-known/api/*`                         | `issuer-did:80`                    | Optional issuer service discovery                               |

Keep these internal/admin-only: `operator-console`, BDRS management, issuer
admin, Vault, PostgreSQL, provisioning credentials, and migration jobs.

The application creates its edge network by default. Set
`OPERATOR_EDGE_NETWORK` to the platform network name and
`OPERATOR_EDGE_NETWORK_EXTERNAL=true` when that network is managed outside this
Compose application.

Participant-owned status and metadata calls require the `x-participant-token` header. Do not place participant tokens in URLs. A verified BPN plus the operator-issued token authorizes automatic setup; the public service queues work while only the internal operator console can write BDRS or issuer state. Failed automatic attempts appear in the admin work queue.

Without an explicit auth mode, admin endpoints default to
`OPERATOR_CONSOLE_AUTH_MODE=api-key` and fail closed when no
`OPERATOR_CONSOLE_API_KEY` is configured. The local example explicitly binds
published ports to `127.0.0.1` before using `network` mode. Production
deployments should use `api-key` or `forwarded-header` behind an authenticating
reverse proxy that removes untrusted copies of the identity header. Public JSON
request bodies are capped by `OPERATOR_MAX_JSON_BODY_BYTES` and default to
1048576 bytes.

## Development

For package-level checks:

```sh
npm install
npm run build --workspace @tx-bootstrap/operator-console
npm run test --workspace @tx-bootstrap/operator-console
```

For the coordinated local stack:

```sh
deploy/local_compose/scripts/up.sh
deploy/local_compose/scripts/bootstrap.sh
deploy/local_compose/scripts/e2e.sh
```

Useful local checks after the stack is up:

```sh
curl http://127.0.0.1:39085/api/health | jq .
curl http://127.0.0.1:39080/api/admin/participants | jq .
```
