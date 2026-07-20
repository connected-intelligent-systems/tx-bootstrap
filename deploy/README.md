# Deployment artifacts

This directory contains reusable deployment packages that are published from
this repository.

- `compose/` contains Docker Compose application manifests published as OCI
  artifacts to GitHub Container Registry.
- `helm/` contains production-oriented Kubernetes charts for the operator and
  participant deployments, published below the `tx-bootstrap-charts` OCI
  namespace in GitHub Container Registry.
- `local_compose/` contains the environment-specific local Compose demo and
  its lifecycle scripts.
- `local_k8s/` contains the Rancher Desktop Kubernetes reference environment.

The local Compose demo consumes the reusable Compose packages and adds local
ports, networks, Vault, and one shared PostgreSQL server with isolated
databases and roles. The local Kubernetes environment consumes the reusable
Helm charts and adds Rancher Desktop-specific PostgreSQL, Vault, Traefik, and
application values. PostgreSQL and Vault are intentionally not part of the
reusable operator or participant applications.

The published applications create their edge/public networks by default. Set
`OPERATOR_EDGE_NETWORK_EXTERNAL=true` or
`PARTICIPANT_PUBLIC_NETWORK_EXTERNAL=true` when the corresponding network is
owned by the deployment platform, as the local deployments do.

## Compose template contract

OCI-backed Compose applications require Docker Compose 2.34.0 or newer. Pin a
stable version or immutable `<version>-dev.sha.<commit>` OCI reference rather
than consuming `latest`. Published artifacts resolve every referenced image to
a digest, so an artifact version continues to deploy the same image set.

The files under `compose/` are reusable base applications. They provide
healthchecks, restart behavior, PID limits, resource ceilings, bounded JSON log
rotation, and a no-new-privileges policy. Consumers can override the fixed
resource ceilings and PID/shutdown defaults in their Compose override.
String-valued behavior can also be selected through `RESTART_POLICY`,
`LOG_DRIVER`, `LOG_MAX_SIZE`, and `LOG_MAX_FILES`. The including deployment owns
PostgreSQL and Vault provisioning, TLS/public ingress, storage and backups,
high availability, secret injection, monitoring, and external network wiring.
`local_compose/` is one such consumer and sets development values explicitly.

The templates fail Compose interpolation when production identity, database,
or security inputs are absent. Both applications require `VAULT_URL` and
`VAULT_TOKEN`. The reusable templates never receive a PostgreSQL administrator
credential.

The operator also requires `BPN_ISSUER`, `BPN_ISSUER_BASE64`, `ISSUER_DID_HOST`,
`BDRS_JDBC_URL`, `BDRS_DB_USER`, `BDRS_DB_PASSWORD`,
`ISSUER_IDENTITYHUB_JDBC_URL`, `ISSUER_IDENTITYHUB_DB_USER`,
`ISSUER_IDENTITYHUB_DB_PASSWORD`, `ISSUER_SERVICE_JDBC_URL`,
`ISSUER_SERVICE_DB_USER`, `ISSUER_SERVICE_DB_PASSWORD`,
`OPERATOR_MIGRATOR_DATABASE_URL`, `OPERATOR_CONSOLE_DATABASE_URL`,
`OPERATOR_ONBOARDING_SERVICE_DATABASE_URL`, `ISSUER_MIGRATOR_DATABASE_URL`,
`ISSUER_CLAIMS_DATABASE_URL`, `BDRS_API_KEY`,
`OPERATOR_CONSOLE_AUTH_MODE`, `OPERATOR_ONBOARDING_SERVICE_ALLOWED_ORIGINS`,
`ISSUER_IDENTITYHUB_ENCRYPTION_KEY_ALIAS`, and
`ISSUER_SERVICE_ENCRYPTION_KEY_ALIAS`. The first-party
`OPERATOR_CONSOLE_IMAGE` and `OPERATOR_ONBOARDING_SERVICE_IMAGE` references are
also required and should use a release tag or digest. When console
authentication mode is `api-key`, `OPERATOR_CONSOLE_API_KEY` must also be set.
Backend services use a dedicated `egress` network for outbound DID and credential access but do not join `edge`. Only `issuer-did` and the
public onboarding service join the operator edge network; management and issuer
admin APIs remain on `operator-internal`, while the console uses the separate
`admin-access` network.

A participant also requires `PARTICIPANT_ROLE`, `PARTICIPANT_BPN`,
`PARTICIPANT_BPN_BASE64`, `PARTICIPANT_CONTEXT_ID`, `PARTICIPANT_DID_HOST`,
`PARTICIPANT_PUBLIC_HOST`, `BPN_ISSUER`, `ISSUER_DID_HOST`, `BDRS_SERVER_URL`,
`EDC_API_KEY`, `IDENTITYHUB_SUPERUSER_API_KEY`,
`PARTICIPANT_IDENTITYHUB_ENCRYPTION_KEY_ALIAS`,
`PARTICIPANT_IDENTITYHUB_JDBC_URL`, `PARTICIPANT_IDENTITYHUB_DB_USER`,
`PARTICIPANT_IDENTITYHUB_DB_PASSWORD`, `PARTICIPANT_EDC_JDBC_URL`,
`PARTICIPANT_EDC_DB_USER`, `PARTICIPANT_EDC_DB_PASSWORD`,
`PARTICIPANT_PORTAL_MIGRATOR_DATABASE_URL`,
`PARTICIPANT_PORTAL_OWNER_ROLE`, `PARTICIPANT_PORTAL_DB_ROLE`, and
`PARTICIPANT_PORTAL_DATABASE_URL`, and `PARTICIPANT_PORTAL_AUTH_MODE`.
`FEDERATED_CATALOG_API_KEY` is also required
and is shared only by the participant portal backend and its private federated
catalog service. `PARTICIPANT_INIT_IMAGE`,
`PARTICIPANT_PORTAL_BACKEND_IMAGE`, and `FEDERATED_CATALOG_IMAGE` must be set to
release tags or digests.

The participant exposes one application-facing API through the portal
gateway. Native, allowlisted EDC management operations remain under
`/api/management`, while catalog search and read-only SPARQL use
`/api/federated-catalog`. The complete machine-readable client contract is
available without credentials at `/api/openapi.json`; protected operations in
that document declare their required API-client scope through
`x-required-scope`. Direct internal-gateway forwarding to EDC
`/management` and `/catalog` is intentionally absent so scoped clients cannot
bypass the gateway. Public DSP and data-plane routes are unchanged.

The reusable participant application requires `PARTICIPANT_PORTAL_AUTH_MODE`
and production runtime defaults fail closed to `forwarded-header`. The
coordinated local Compose deployment uses participant-local browser gateways
with Nginx Basic Auth and `forwarded-header` mode. Other deployments should
configure a trusted authentication proxy, overwrite the selected identity
header, and allow `txb_` machine bearer tokens to reach an API-only route.
Unauthenticated `none` mode treats requests without a machine token as local
portal administrators and is rejected in production unless
`PARTICIPANT_PORTAL_ALLOW_INSECURE_AUTH=true` explicitly acknowledges that
risk. Identity providers remain outside the reusable participant application
and Helm chart.

The Compose federated-catalog volume is participant-project scoped and the
service must remain at one replica. Kubernetes uses a StatefulSet with one PVC
per replica. Additional Helm replicas persist and crawl independently, which
multiplies outbound traffic and can temporarily return different snapshots.

## Database lifecycle

Run the convergent scripts under `database/` with a PostgreSQL administrator
before deploying an application. They create databases and restricted roles,
repair ownership, rotate supplied passwords, and revoke public database/schema
privileges. The administrator credential is not passed to an application
container.

Schema lifecycle is split by component:

- Tractus-X IdentityHub, Issuer Service, BDRS, and EDC retain their packaged
  startup migrations and use a database dedicated to that component.
- `db-migrator` exclusively migrates the operator `dataspace_admin` database.
  The operator console and onboarding service start only after it succeeds.
- `participant-db-migrator` exclusively migrates the participant portal
  database. The portal runtime cannot create or alter schema objects.
- `issuer-claims-grant` waits for Issuer Service startup and grants the console
  claims login only `SELECT`, `INSERT`, and `UPDATE` on the required issuer
  table.

The custom migrators use advisory locking, per-file transactions, immutable
SHA-256 checksums, and bounded connection retries. A migration login is a member
of one non-login owner role and has no cluster-wide database-creation rights.
See [`database/README.md`](database/README.md) for the role matrix, variables,
and production run order.

Set `PUBLIC_DATAPLANE_TOKEN_REFRESH_ENDPOINT` when the externally reachable
data-plane URL differs from `https://${PARTICIPANT_PUBLIC_HOST}/api/public`.
Persisted EDRs advertise this endpoint for refreshing their short-lived access
tokens after a restart.

The base applications do not deploy or initialize Vault. Consumers must make
the Vault endpoint reachable from every client and provision required secrets
before dependent services start. The operator expects `password`,
`mgmt-api-key`, `edc.datasource.didentry.user`, and
`edc.datasource.didentry.password` in the configured KV mount. A participant
expects `password` and `super-user-apikey`; its `participant-init` service then
provisions participant-specific STS, signing, and API-key material. Production
consumers should use narrowly scoped, short-lived tokens and their platform
secret-injection mechanism. The local overlays add isolated, file-backed Vault
servers with persistent data and local-only unseal-material volumes.

IdentityHub JTI validation and strict encryption default to `true`. Each AES key
alias is mandatory and must resolve to a Vault secret whose content is a
base64-encoded 16-, 24-, or 32-byte AES key. Keys must remain stable for the
lifetime of encrypted participant-config data; rotation requires re-encryption,
and existing plaintext data must be migrated before strict AES encryption is
enabled. A migration deployment can explicitly set the corresponding
`*_ENCRYPTION_STRICT=false`. The local overlays generate persistent 32-byte keys
once per Vault.
