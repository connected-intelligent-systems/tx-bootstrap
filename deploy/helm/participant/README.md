# tx-bootstrap participant chart

This chart deploys one participant without PostgreSQL or Vault. Infrastructure,
database provisioning, Vault bootstrap, DNS/TLS, ingress, backups, and
monitoring remain environment responsibilities.

## What it installs

- participant Identity Hub
- Tractus-X EDC control plane and data plane
- participant portal backend
- participant-local federated catalog StatefulSet with one PVC per replica
- public DID/DSP/data-plane gateway
- separate internal portal/management gateway
- a pre-install/pre-upgrade portal database migration Job
- a tracked, convergent participant initialization Job
- internal Services, ConfigMaps, optional Ingresses, and a ServiceAccount with
  Kubernetes API-token automounting disabled

The chart sets startup, readiness, and liveness probes, resource requests and
limits, a runtime-default seccomp profile, numeric non-root identities,
`allowPrivilegeEscalation: false`, and a drop of all Linux capabilities. These
defaults satisfy the container security-context requirements of the Kubernetes
Restricted Pod Security Standard. A read-only root filesystem is not forced
because not every upstream component has been verified with it.

The numeric identities under each component's `securityContext` match the
default images. When replacing an image, also set `runAsUser` and `runAsGroup`
to the non-root IDs provided by that image. Both gateways use the official
unprivileged NGINX image and listen on container port 8080; their Services
continue to expose port 80.

## Database and initialization lifecycle

Run [`deploy/database/participant/provision.sh`](../../database/participant/provision.sh)
before Helm. It creates three databases and their restricted roles; the
PostgreSQL administrator credential is not used by this chart.

Installation is ordered as follows:

1. The portal migrator pre-hook migrates only the participant portal database.
   Failure stops the release.
2. Identity Hub and EDC perform their packaged startup migrations using the
   owners of their dedicated databases.
3. The participant-init Job waits for Identity Hub, creates the participant
   context idempotently, prepares the STS/token-signer aliases in Vault, and
   writes a configuration-specific completion marker.
4. The control plane init container waits for that Vault marker without using
   the Kubernetes API.
5. The data plane waits for control-plane readiness. The federated catalog
   starts crawling through the control plane and the portal routes scoped
   catalog access to it. Gateway readiness checks also include their upstreams.

The participant-init Job name contains a configuration hash. A chart or
identity/endpoints change therefore creates a fresh Job instead of trying to
patch an immutable completed Job. `--wait-for-jobs` keeps the release from
succeeding until initialization completes.

## Vault isolation

Each participant needs an isolated Vault KV mount or a separate Vault instance.
Participant initialization writes generic runtime aliases such as
`sts-oauth-client-secret` and `token-signer-key`; sharing the same KV path
between participants would overwrite those aliases.

Before installation, provision:

- the token referenced by `existingSecret.keys.vaultToken`
- an AES key under `identityHub.encryptionKeyAlias`

The participant-init Job receives the required Identity Hub superuser key from
the existing Kubernetes Secret. The optional `identityHubApiKey` mapping is for
the portal; if omitted, the portal reads its participant-context key from Vault.

Use narrowly scoped Vault policies and TLS in non-local environments.

## Required Kubernetes Secret

Create the namespace and the Secret named by `existingSecret.name` before
running Helm. The chart only references it and never renders secret values.
The portal migration pre-hook uses the pre-existing ServiceAccount selected by
`jobs.portalMigrator.serviceAccountName` (`default` unless overridden), with API
token automounting disabled; normal workloads use the chart-managed account.

| Default key                     | Purpose and expected login                  |
| ------------------------------- | ------------------------------------------- |
| `vault-token`                   | participant-scoped Vault token              |
| `identityhub-superuser-api-key` | Identity Hub bootstrap superuser key        |
| `identityhub-jdbc-url`          | Identity Hub JDBC URL                       |
| `identityhub-db-user`           | Identity Hub database owner/runtime user    |
| `identityhub-db-password`       | Identity Hub database password              |
| `edc-jdbc-url`                  | shared control/data-plane JDBC URL          |
| `edc-db-user`                   | participant EDC database owner/runtime user |
| `edc-db-password`               | participant EDC database password           |
| `portal-migrator-database-url`  | portal migration login URL                  |
| `portal-database-url`           | restricted portal runtime URL               |
| `edc-api-key`                   | EDC management API key                      |
| `federated-catalog-api-key`     | private portal-to-catalog service key       |

`identityhub-api-key` and `onboarding-registration-token` are optional. Leave
their key mappings empty to render explicit empty values and use the existing
Vault/onboarding behavior. Key names can be changed under `existingSecret.keys`.

Use TLS-enabled PostgreSQL URLs and source the Secret from the platform's secret
manager. Never provide a PostgreSQL administrator credential to the chart.

## Public and internal exposure

`ingress.public` routes the DID document, DSP API, public data-plane API,
credential service, and version endpoint. When the DID and public hostnames
differ, include both in `ingress.public.hosts` and its TLS certificate.

`ingress.internal` exposes the portal's participant-facing API and the
unrelated Identity Hub identity routes. EDC management/catalog are not
forwarded directly. The portal exposes only explicitly mapped EDC operations
and the federated-catalog REST/SPARQL routes.

Portal authentication defaults to `portal.auth.mode: forwarded-header`.
Ingress must authenticate callers, overwrite the header configured by
`portal.auth.header`, and prevent direct access that could spoof it. An OAuth2
Proxy can provide that boundary but is not installed by the chart.

For isolated development only, `portal.auth.mode: none` can be enabled together
with `portal.auth.allowInsecure: true`. In that mode callers can omit an API
client token and become the local portal administrator, so scopes do not
provide isolation. The explicit acknowledgement prevents this mode from being
selected accidentally in a production values file.

Helmet security headers and global request limiting are enabled by default.
Use `portal.httpsHeaders: false` only for an intentionally HTTP-only local
environment. Tune `portal.rateLimit.max` and `portal.rateLimit.window` for the
expected ingress traffic; health probes are not counted.

The federated catalog defaults to one replica. Increasing
`federatedCatalog.replicaCount` creates one PVC per pod; replicas crawl
independently without leader election or shared RDF storage. Do not point two
processes at the same Oxigraph directory. Short-lived differences between
replicas and multiplied catalog traffic are expected.

## Participant-facing API

The portal and machine clients use the same internal-ingress routes. Portal
administrators satisfy all scopes; API clients use `Authorization: Bearer
txb_...` tokens created under **Settings / API clients**. Complete tokens are
returned only at creation or rotation. `GET /api/openapi.json` serves the
machine-readable participant API contract without credentials. It contains
only gateway-allowlisted operations and identifies each operation's scope in
`x-required-scope`.

| Scope                                                           | Exposed capability                              |
| --------------------------------------------------------------- | ----------------------------------------------- |
| `federated-catalog:read`                                        | cached dataset search, detail, and crawl state  |
| `federated-catalog:sparql`                                      | bounded read-only SPARQL                        |
| `catalog:read`                                                  | live EDC catalog/dataset requests               |
| `assets:read`, `assets:write`                                   | asset query/get and mutations                   |
| `policies:read`, `policies:write`                               | policy query/get and mutations                  |
| `business-partner-groups:read`, `business-partner-groups:write` | partner-group reads and mutations               |
| `contract-definitions:read`, `contract-definitions:write`       | offer-definition reads and mutations            |
| `contract-negotiations:read`, `contract-negotiations:write`     | negotiation query/get and initiate/terminate    |
| `contract-agreements:read`, `contract-agreements:retire`        | agreement reads and retirement/reactivation     |
| `transfers:read`, `transfers:write`                             | transfer query/get and start/terminate          |
| `data:proxy`                                                    | authenticated HTTP access through consumer EDRs |
| `edr:data-address:read`                                         | EDR data-address credentials                    |

QuerySpec `POST .../request` operations count as reads. Generic agreement
mutations, generic negotiation/transfer CRUD, DSP proxying, and unmapped EDC
routes are rejected before an upstream request is made. EDR and one-time token
responses use `Cache-Control: no-store`.

## Install

Prepare environment-owned values with real identity, endpoints, Secret key
mappings, immutable image tags or digests, resources, ingress, and scheduling:

```sh
helm lint --strict deploy/helm/participant
helm template participant deploy/helm/participant \
  --namespace tx-participant \
  --values /path/to/participant-values.yaml
```

After PostgreSQL, Vault, the namespace, Secret, DNS, and TLS are ready:

```sh
helm upgrade --install participant deploy/helm/participant \
  --namespace tx-participant \
  --values /path/to/participant-values.yaml \
  --rollback-on-failure \
  --wait=legacy \
  --wait-for-jobs \
  --timeout 15m
```

To install the published chart instead, replace `deploy/helm/participant` with
`oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-charts/tx-bootstrap-participant` and
add `--version 0.1.2`.

The command above targets Helm 4. The legacy wait strategy avoids its watcher
edge case when completed hook Jobs are deleted. With Helm 3, replace
`--rollback-on-failure --wait=legacy` with `--atomic --wait`.

Failed portal migration hooks are retained under revision-specific names, so a
retained failure does not block a retry. The tracked participant-init Job is
also retained as deployment evidence and removed with the release or replaced
when its configuration hash changes.

## Deliberately deferred

NetworkPolicies require the target cluster CNI and its actual PostgreSQL,
Vault, DNS, issuer, BDRS, and onboarding destinations. PodDisruptionBudgets and
replica scaling require verification of the upstream components'
multi-replica behavior. Those policies therefore remain environment-specific.
