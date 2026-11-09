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
`OPERATOR_EDGE_NETWORK` to the platform network name and override
`networks.edge.external: true` when that network is managed outside this
Compose application. The local deployment overlay defaults to an external
network and accepts `OPERATOR_EDGE_NETWORK_EXTERNAL` as a local override.

Participant-owned status and metadata calls require the `x-participant-token` header. Do not place participant tokens in URLs. A verified BPN plus the operator-issued token authorizes automatic setup; the public service queues work while only the internal operator console can write BDRS or issuer state. Failed automatic attempts appear in the admin work queue.

Without an explicit auth mode, admin endpoints default to
`OPERATOR_CONSOLE_AUTH_MODE=api-key` and fail closed when no
`OPERATOR_CONSOLE_API_KEY` is configured. The local example explicitly binds
published ports to `127.0.0.1` before using `network` mode. Production
deployments should use `api-key` or `forwarded-header` behind an authenticating
reverse proxy that removes untrusted copies of the identity header. Public JSON
request bodies are capped by `OPERATOR_MAX_JSON_BODY_BYTES` and default to
1048576 bytes.

## Optional Headscale enrollment API

Participants normally publish their protocol endpoints through their own
public HTTPS reverse proxy. For participants without one, the operator can
offer an optional **tunnel**: the participant runs one Tailscale sidecar, and a
shared ingress terminates TLS for `<bpn>.<participant domain>` and forwards to
it. Both options give the participant the same kind of public `did:web`, so a
participant can move between them by changing DNS without changing identity.
See [Participant tunnel](participant-tunnel.md) for the participant and
ingress side.

The console manages tunnel enrollment against the operator's own Headscale
server, which tx-bootstrap does not deploy (like PostgreSQL and Vault); see
[Headscale requirements](participant-tunnel.md#headscale-requirements). This
backend integration targets Headscale **0.29.7** and is disabled by default.
It never needs access to the ingress host.

Enable it only in the console backend:

```dotenv
HEADSCALE_ENABLED=true
HEADSCALE_URL=https://headscale.example.org
HEADSCALE_PARTICIPANT_TAG=tag:txb-participant
HEADSCALE_PARTICIPANT_DOMAIN=tunnel.example.org
HEADSCALE_ENROLLMENT_TTL_SECONDS=900
HEADSCALE_INVITATION_TTL_SECONDS=604800
HEADSCALE_STALE_NODE_SECONDS=604800
HEADSCALE_TIMEOUT_MS=5000
```

Provide `HEADSCALE_API_KEY` from your secret manager, or mount a secret and set
`HEADSCALE_API_KEY_FILE` to its container path. Use one credential source. The
Compose artifact accepts the environment variable; using a file also requires
an environment/volume override for the console. The API key is an
**administrative Headscale credential**, stays in the console backend, and is
never part of participant enrollment responses or browser runtime config.
HTTPS certificate validation is required; redirects are rejected. Enrollment
TTL is limited to 60–3600 seconds, independently of node lifetime. Keys issued
with a participant invitation use the invitation TTL instead (default 7 days,
1 hour to 30 days), because they wait until the participant first deploys.

Run the normal database migrator when upgrading. Migration
`0002_network_enrollments.sql` creates an admin-only metadata table. The public
onboarding database role receives no access to it. The table stores deployment
UUID, participant association, server origin, tag, key ID, workflow state and
timestamps. It stores no plaintext join key, and allows only one active
(`CREATING`, `ISSUED` or `REVOKING`) enrollment per participant.

The Headscale policy must declare the configured participant tag and grant
only ingress → participant TCP 18080
([example](participant-tunnel.md#headscale-requirements)). Participants need no
grants: their outbound traffic uses the public internet. Peer-to-peer
participant access, host/LAN routes, exit nodes and Tailscale SSH should have no
grants. This API does not edit Headscale policy. File-based policy can remain
enabled.

All routes below require the normal console admin authentication. Paths are
relative to `/api`; `participantId` is the business partner UUID, not its BPN.

| Method | Route                                                                         | Result                                                                             |
| ------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| GET    | `/admin/network`                                                              | Disabled status, or an authenticated connectivity check and safe provider settings |
| POST   | `/admin/participants/:participantId/network-enrollments`                      | Issue one key for a new deployment UUID                                            |
| GET    | `/admin/participants/:participantId/network-enrollments`                      | List metadata and observe matching nodes, without join keys                        |
| POST   | `/admin/participants/:participantId/network-enrollments/:deploymentId/revoke` | Expire the key and delete nodes enrolled with it; retryable                        |

Enrollment creation expects only:

```json
{ "deploymentId": "550e8400-e29b-41d4-a716-446655440001" }
```

The participant must already be verified and have an assigned BPN. Generate a
new deployment UUID for each deployment. A successful `201` response includes
`authKey` **once**, plus `controlUrl`, `hostname`, `publicHost`, tag,
expiration, metadata and `participantEnv`: the values the participant sets for
the tunnel override.
Responses use `Cache-Control: no-store`. Retrying the same deployment UUID
returns `409` and does not issue or recover a key. Requesters cannot choose
privileged tags or create reusable/ephemeral keys. Do not log or commit the
creation response; hand it directly to the participant deployment mechanism.

Create keys when preparing deployment, rather than when creating the business
partner. The node ID and IP exist only after it joins. Status maps nodes
through the Headscale pre-auth key ID, not their self-reported hostname. It
reports `AWAITING_JOIN`, `EXPIRED`, `ONLINE`, `OFFLINE`, `STALE`, `AMBIGUOUS`,
or `UNKNOWN`, plus the node's last-seen time. `STALE` means offline for longer
than `HEADSCALE_STALE_NODE_SECONDS` (7 days by default). Stale nodes are only
flagged, never removed automatically, because a participant may be offline on
purpose.

The tunnel hostname is the participant's lowercase BPN, so it stays the same
across re-enrollment. Participants choose their own hostname when joining, so
the console assigns names itself: every 15 seconds it renames each enrolled
node to its canonical name and first moves any other node holding a reserved
name to `txb-unverified-<node id>`. A node reports `routable: true` once it
carries its canonical name. Several nodes on one key are reported as
`AMBIGUOUS` and are not renamed.
An expired enrollment key does not expire an already enrolled node. Network
status is separate from dataspace credential issuance and application health.

Workflow states are `CREATING`, `ISSUED`, `FAILED`, `REVOKING`, and `REVOKED`.
Creation is never retried automatically: a timeout or a process failure can
leave an unknown remote result. An incomplete record without a known key ID
requires inspection in Headscale before a new deployment is issued; the
short key TTL limits new registrations but does not remove a node that already
joined. If database persistence fails after key creation, the backend attempts
to expire the key. Revocation commits `REVOKING` before remote cleanup, so a
failed cleanup can be retried with the same revoke endpoint; the reconciliation
below also retries it automatically. Changing the
configured server origin prevents cleanup of old records against the new
server's IDs. A lost successful creation response requires revoking that
deployment and issuing a new deployment UUID.

The same 15-second reconciliation also ties the tunnel to the participant's
lifecycle. When a participant is rejected, its issued enrollment is revoked:
the key is expired, its node deleted and a `participant.network_enrollment_revoked`
event recorded with the actor `system:network-reconciler`. Revocations stuck in
`REVOKING`, for example because Headscale was unreachable, are retried on every
run until they succeed.

The console only issues keys, tracks nodes, assigns names and revokes. Routing
follows from the name: the ingress forwards `<name>.<participant domain>` to
the node of the same MagicDNS name, so no per-participant route is ever pushed.

API contracts: [Headscale REST mappings](https://github.com/juanfont/headscale/blob/v0.29.7/proto/headscale/v1/headscale.proto),
[enrollment keys](https://github.com/juanfont/headscale/blob/v0.29.7/proto/headscale/v1/preauthkey.proto),
[nodes](https://github.com/juanfont/headscale/blob/v0.29.7/proto/headscale/v1/node.proto).

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
