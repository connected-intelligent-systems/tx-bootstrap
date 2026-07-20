# tx-bootstrap operator chart

This chart deploys the operator application services without PostgreSQL or
Vault. It is intended for Kubernetes environments where infrastructure,
secrets, ingress, backups, and monitoring are managed separately.

## What it installs

- Issuer Identity Hub, Issuer Service, and BDRS
- the public issuer DID gateway
- the operator console and onboarding service
- one pre-install/pre-upgrade Job for the `dataspace_admin` migrations
- one post-install/post-upgrade Job for the restricted issuer-claims grant
- internal Services, optional Ingress resources, ConfigMaps, and an unprivileged
  ServiceAccount that does not mount a Kubernetes API token

The chart sets startup, readiness, and liveness probes; resource requests and
limits; a runtime-default seccomp profile; numeric non-root identities;
`allowPrivilegeEscalation: false`; and a drop of all Linux capabilities. These
defaults satisfy the container security-context requirements of the Kubernetes
Restricted Pod Security Standard. A read-only root filesystem is not forced
because not every upstream component has been verified with it.

The numeric identities under each component's `securityContext` match the
default images. When replacing an image, also set `runAsUser` and `runAsGroup`
to the non-root IDs provided by that image. The issuer DID gateway uses the
official unprivileged NGINX image and listens on container port 8080; its
Service continues to expose port 80.

## Database lifecycle

Database provisioning is outside the chart. Run
[`deploy/database/operator/provision.sh`](../../database/operator/provision.sh)
with a PostgreSQL administrator before installation. The administrator
credential is never placed in the application Secret.

Lifecycle ordering is:

1. The external provisioner creates the four databases and restricted roles.
2. The chart's pre-install/pre-upgrade `db-migrator` hook migrates only the
   `dataspace_admin` database. A failure stops the Helm release.
3. Identity Hub, Issuer Service, and BDRS run their packaged schema migrations
   during application startup, each using the owner of its dedicated database.
4. Once the application resources are ready, the post-install/post-upgrade
   grant hook gives `issuer_claims_writer` only `SELECT`, `INSERT`, and `UPDATE`
   on `custom_attestation_claims`.
5. The console and onboarding service use restricted runtime logins.

The issuer grant Job connects to the Issuer Service database as its owner. It
does not receive PostgreSQL cluster-administrator rights and cannot access the
other databases. See the [database role matrix](../../database/README.md) for
the complete privilege model.

## Required Secret

Create the Secret named by `existingSecret.name` in the release namespace
before installation. The migration hook runs before normal chart resources, so
the chart deliberately cannot create this Secret itself. A platform secret
controller may own it; the chart only uses `secretKeyRef` references.

The namespace must therefore exist before Helm runs. The pre-install Job uses
the pre-existing ServiceAccount selected by `jobs.migrator.serviceAccountName`
(`default` unless overridden) with API-token automounting disabled. All normal
workloads use the chart-managed ServiceAccount.

| Default key                      | Purpose and expected login                           |
| -------------------------------- | ---------------------------------------------------- |
| `vault-token`                    | runtime Vault token                                  |
| `identityhub-jdbc-url`           | Identity Hub JDBC URL                                |
| `identityhub-db-user`            | Identity Hub database owner/runtime user             |
| `identityhub-db-password`        | Identity Hub database password                       |
| `issuer-service-jdbc-url`        | Issuer Service JDBC URL                              |
| `issuer-service-db-user`         | Issuer Service database owner/runtime user           |
| `issuer-service-db-password`     | Issuer Service database password                     |
| `bdrs-jdbc-url`                  | BDRS JDBC URL                                        |
| `bdrs-db-user`                   | BDRS database owner/runtime user                     |
| `bdrs-db-password`               | BDRS database password                               |
| `operator-migrator-database-url` | `operator_migrator` URL for `dataspace_admin`        |
| `operator-console-database-url`  | `operator_console_login` URL for `dataspace_admin`   |
| `onboarding-database-url`        | `registration_svc_login` URL for `dataspace_admin`   |
| `issuer-migrator-database-url`   | Issuer Service owner URL, used only by the grant Job |
| `issuer-claims-database-url`     | `issuer_claims_writer` runtime URL                   |
| `bdrs-api-key`                   | BDRS management API key                              |
| `operator-console-api-key`       | console key when `auth.mode=api-key`                 |

`issuer-api-key` is optional. Leave its key mapping empty to let the console
retrieve that key from Vault. All key names can be changed under
`existingSecret.keys`.

`operatorConsole.auth.mode` supports `api-key` and `forwarded-header`. API-key
mode requires the Secret key above. Forwarded-header mode trusts the configured
`operatorConsole.auth.header` and must only be used behind an authenticating
reverse proxy that removes untrusted copies of that header before setting it.
Use `operatorConsole.auth.allowedUsers` to restrict the accepted identities.

Use TLS-enabled PostgreSQL connections (`sslmode=verify-full` for libpq URLs and
the equivalent JDBC parameters) and source values from a secret manager. Do not
commit a production Secret manifest or pass database administrator credentials
to this chart.

## Install

Copy `values.yaml` to an environment-owned file and set at least:

- issuer BPN, base64 path identifier, and public DID hostname
- Vault URL and pre-provisioned token Secret key
- the existing Secret name/key mappings
- public origin and authentication settings
- ingress hosts, class, annotations, and TLS Secrets where Ingress is used
- immutable image tags or, preferably, `sha256:` image digests
- environment-specific resources and scheduling rules

Validate without a cluster:

```sh
helm lint --strict deploy/helm/operator
helm template operator deploy/helm/operator \
  --namespace tx-operator \
  --values /path/to/operator-values.yaml
```

Install once PostgreSQL, Vault, the Secret, DNS/TLS, and ingress routing exist:

```sh
helm upgrade --install operator deploy/helm/operator \
  --namespace tx-operator \
  --values /path/to/operator-values.yaml \
  --rollback-on-failure \
  --wait=legacy \
  --wait-for-jobs \
  --timeout 15m
```

To install the published chart instead, replace `deploy/helm/operator` with
`oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-charts/tx-bootstrap-operator` and add
`--version 0.1.2`.

The command above targets Helm 4. The legacy wait strategy avoids its watcher
edge case when completed hook Jobs are deleted. With Helm 3, replace
`--rollback-on-failure --wait=legacy` with `--atomic --wait`.

If a hook fails, inspect it before retrying:

```sh
kubectl -n tx-operator get jobs,pods
kubectl -n tx-operator logs -l app.kubernetes.io/component=db-migrator
kubectl -n tx-operator logs -l app.kubernetes.io/component=issuer-claims-grant
```

Failed hook Jobs are retained; successful ones are deleted. Rerunning the Helm
operation uses a revision-specific Job name, so a retained failure does not
block the retry. The application migrations and grant operation are convergent
and advisory-lock protected.

## Deliberately deferred

NetworkPolicy rules depend on the target cluster CNI and its reachable
PostgreSQL, Vault, DNS, and public DID endpoints. PodDisruptionBudgets and
horizontal scaling also need a decision about component replica safety. These
remain environment-specific instead of being enabled with unsafe defaults.
