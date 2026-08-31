# Local Compose Deployment

The local Compose stack contains a production-shaped Tractus-X dataspace split
into three ownership domains. For the Rancher Desktop environment, see
[`deploy/local_k8s/README.md`](../deploy/local_k8s/README.md).

- `operator/` - dataspace operator
- `provider/` - provider participant
- `consumer/` - consumer participant

The provider and consumer folders under `deploy/local_compose/` are thin
tx-bootstrap local overlays. Their `compose.yaml` files include the reusable
participant compose manifest from `deploy/compose/participant.compose.yaml`;
the shared participant overrides add convergent database provisioning,
connectivity to the local PostgreSQL service, and persistent Vault. Role-specific
portal and onboarding behavior is supplied through each role environment file.
Each participant overlay also adds an authenticated browser gateway and an
API-only machine gateway. Nginx Basic Auth protects each browser gateway, so the
complete stack works with plain `localhost` URLs and needs no additional
authentication service.
The operator folder includes `deploy/compose/operator.compose.yaml`, while its
overrides add database provisioning, local database connectivity, console ports,
and a persistent Vault server. The root `deploy/local_compose/compose.yaml` owns one
PostgreSQL instance for the coordinated local deployment.

The reusable compose files are pulled as OCI artifacts by default. For local
development, `deploy/local_compose/local.env.example` points
`PARTICIPANT_COMPOSE_REF` and `OPERATOR_COMPOSE_REF` at the in-repo
`deploy/compose/participant.compose.yaml` and
`deploy/compose/operator.compose.yaml` files.

On pushes to `main`, the reusable applications are published to GHCR as:

- `oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-operator:latest`
- `oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-participant:latest`

Version tags such as `v1.2.3` also publish `1.2.3` and `1.2` artifact
tags. Every `main` commit publishes the canonical development stack version
`<version>-dev.sha.<commit>` as well as a `sha-<commit>` alias. Production
consumers should use a stable version or immutable commit-derived tag instead
of `latest`. Pull requests validate both applications without publishing them.

Provider, consumer, and operator data remain isolated in uniquely named
databases and roles. Only the local PostgreSQL server process is shared; there
is no shared application schema, wallet, or Vault.

`local.env.example` exists only for the helper scripts that coordinate all three
roles in one local demo run.

Provider and consumer use the same participant portal runtime image built from `apps/participant-portal`. Override
`PARTICIPANT_PORTAL_BACKEND_IMAGE` in `local.env` to test a rebuilt onboarding/portal runtime; the variable name is kept for compose compatibility.

## Network Model

The local setup uses role-private backend, database, egress, and administrative
networks plus one shared public network:

```text
tx-bootstrap-operator-internal
tx-bootstrap-operator-egress
tx-bootstrap-admin-access
tx-bootstrap-provider-backend
tx-bootstrap-provider-internal
tx-bootstrap-provider-egress
tx-bootstrap-consumer-backend
tx-bootstrap-consumer-internal
tx-bootstrap-consumer-egress
tx-bootstrap-operator-database
tx-bootstrap-provider-database
tx-bootstrap-consumer-database
tx-bootstrap-public
```

The PostgreSQL container joins three private database networks. Each application
domain joins only its corresponding database network, so sharing the server does
not create cross-domain container reachability. Vaults stay on role-private
backend/internal networks. Participant-init uses its private backend and the
role's egress network. The egress networks provide outbound connectivity without
joining public ingress surfaces, while `admin-access` connects the local
operator administration services. The shared public network simulates
production DNS/TLS reachability between organizations and carries public DID,
DSP, BDRS, credential, and data-plane gateway traffic.

Because Docker resolves those simulated public gateway names to private bridge
addresses, the local environment explicitly allows `provider-did` and
`consumer-did` as transfer-preview and download targets. Other private,
loopback, and link-local destinations remain blocked by the portal's SSRF
protection.

The bootstrap and E2E helpers are local-only exceptions: they temporarily attach
to the networks needed to provision and verify demo state.

## Run Locally

From the `tx-bootstrap` repository root:

```bash
deploy/local_compose/scripts/up.sh
deploy/local_compose/scripts/bootstrap.sh
deploy/local_compose/scripts/e2e.sh
```

What each step does:

- `up.sh` creates the shared public network, starts and health-checks the single
  local PostgreSQL instance, then starts operator, provider, and consumer
  compose projects. Local one-shot provisioners create or repair their unique
  databases and roles before schema migrations and runtime startup.
  Participant wallet initialization is handled by each participant stack's
  `participant-init` service.
- `bootstrap.sh` registers the operator issuer BDRS mapping, creates
  the provider demo asset, policies, and contract definition, verifies public DID
  documents, creates fixed local provider/consumer participant cases, verifies
  those BPNs as imported local bootstrap data, and runs credential requests
  through the participant gateways.
- `e2e.sh` runs catalog request, contract negotiation, transfer, EDR
  retrieval, and data access. It first verifies that anonymous and spoofed
  machine requests receive `401`, authenticates portal-administrator calls
  through Basic Auth, and then verifies the generated scoped client token
  against the API-only gateway.

The startup script prints the browser and scoped API URLs. The committed
local-only portal credential is:

```text
admin / local-admin-password
```

The provider portal uses `http://localhost:29283` and the consumer portal uses
`http://localhost:19283`; no custom local hostnames are required. Each Nginx
portal gateway validates Basic Auth and copies only the authenticated username
to its portal backend as `Remote-User`. The API gateway exposes only
`/api/management` and `/api/federated-catalog`; it strips cookies, API keys, and
caller-supplied identity headers before the backend validates a `txb_` bearer
token.

To replace the development credential, generate a bcrypt htpasswd entry and set
`PORTAL_BASIC_AUTH_USERS`, `PORTAL_ADMIN_USERNAME`, and
`PORTAL_ADMIN_PASSWORD` together in the coordinated environment file:

```bash
htpasswd -nbB admin 'new-password'
```

Place the resulting `admin:$2y$...` value in single quotes in the environment
file so the dollar signs remain literal. The plaintext password is used only by
the bootstrap/E2E helpers; Nginx receives the bcrypt entry. Any externally
reachable deployment must use HTTPS and a production authentication proxy.

Stop the local stack:

```bash
deploy/local_compose/scripts/down.sh
```

The shared local PostgreSQL data, role-specific Vault data, and local-only
unseal material are stored in named volumes, so a plain `down` followed by `up`
preserves database and Vault state. Provisioning and migration jobs are safe to
rerun. The unseal
material is intentionally automated for this local deployment only; production
deployments must provide an externally managed Vault through the reusable
template contract.

Remove containers and volumes:

```bash
deploy/local_compose/scripts/down.sh --volumes
```

Remove the shared public network too:

```bash
REMOVE_NETWORK=1 deploy/local_compose/scripts/down.sh --volumes
```

### Upgrading the earlier local database layout

An existing checkout that previously ran one PostgreSQL container per role
needs a one-time local reset before its first start with the shared instance:

```bash
deploy/local_compose/scripts/down.sh --volumes
deploy/local_compose/scripts/up.sh
```

The old PostgreSQL volumes cannot be combined automatically. Retaining the old
Vault state while starting with a fresh shared database can also leave keys that
refer to wallet or issuer contexts no longer present in PostgreSQL. This reset
deletes local demo state only; the unreferenced legacy PostgreSQL volumes are
not removed automatically and can be retained temporarily for rollback.

## Validate Compose Files

Each role can be checked independently:

```bash
docker compose --env-file deploy/local_compose/local.env.example -f deploy/local_compose/compose.yaml config
docker compose --env-file deploy/local_compose/operator/.env.example -f deploy/local_compose/operator/compose.yaml config
docker compose --env-file deploy/local_compose/provider/.env.example -f deploy/local_compose/provider/compose.yaml config
docker compose --env-file deploy/local_compose/consumer/.env.example -f deploy/local_compose/consumer/compose.yaml config
```

The coordinated local env can also be checked:

```bash
docker compose --env-file deploy/local_compose/local.env.example -f deploy/local_compose/compose.yaml config
docker compose --env-file deploy/local_compose/local.env.example -f deploy/local_compose/operator/compose.yaml config
docker compose --env-file deploy/local_compose/local.env.example -f deploy/local_compose/provider/compose.yaml config
docker compose --env-file deploy/local_compose/local.env.example -f deploy/local_compose/consumer/compose.yaml config
```

## Important Boundaries

Provider and consumer EDCs use their own participant wallets:

- provider EDC -> `provider-identityhub`
- consumer EDC -> `consumer-identityhub`

Both use the operator BDRS:

- provider/consumer EDC -> `issuer-did` public gateway (`/api/directory`)

The local participant-facing routes are intentionally split:

- `localhost:29283` and `localhost:19283` authenticate humans through the
  participant Nginx gateways and forward a trusted `Remote-User` header.
- `localhost:29282` and `localhost:19282` accept only scoped `txb_` clients on the two mapped
  API prefixes.
- the reusable `internal-gateway` and portal backend have no local host port.

The bundled data-exchange check uses a simple provider demo asset configured by
`PROVIDER_DEMO_ASSET_URL` in `local.env.example`. It defaults to
`https://jsonplaceholder.typicode.com/todos/1`; deployments can replace it with
a project-specific test endpoint.

## Operator Console

The operator services serve the operator console on:

```text
http://127.0.0.1:39080
```

It also exposes the local BDRS management API on:

```text
127.0.0.1:39081
```

The React app in `apps/operator-console` is built into the operator
stack and runs with a small Node backend. The backend exposes a Participants
workspace over internal business-partner and onboarding-case tables and automatically
provisions BDRS/IssuerService state after a verified participant submits connector
metadata. Operators only handle exhausted failures and explicit retries.

BDRS remains owned by the operator services. Participant credentials are not downloaded
from the operator console; the participant portal calls the participant-owned IdentityHub
DCP credential request API.
