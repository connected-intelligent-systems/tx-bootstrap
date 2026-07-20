# tx-bootstrap

Bootstrap and deployment tooling for a Tractus-X-style dataspace.

This monorepo combines the operator and participant applications with reusable
Docker Compose packages, Kubernetes Helm charts, database provisioning, and a
complete local demo environment. It is intended for development and research
deployments where the full dataspace needs to be started, onboarded, and
verified from one checkout.

## What is included

- An operator domain with the operator console, public onboarding service,
  issuer Identity Hub, Issuer Service, BDRS, and DID gateway.
- A participant domain with Identity Hub, EDC control and data planes, a
  participant portal, public and internal gateways, and initialization jobs.
- A coordinated local environment with one operator, one provider, and one
  consumer, including authenticated participant portals.
- Production-oriented Helm charts and reusable Compose applications that do
  not bundle PostgreSQL or Vault.

## Quick start

The local environment requires Docker with Compose v2. From the repository
root, start the stack, bootstrap its demo state, and run the end-to-end check:

```sh
deploy/local_compose/scripts/up.sh
deploy/local_compose/scripts/bootstrap.sh
deploy/local_compose/scripts/e2e.sh
```

The startup script builds the repository-owned images and prints the local
service URLs. It uses `deploy/local_compose/local.env.example` by default; set
`TX_BOOTSTRAP_ENV_FILE` to use a different environment file.

Stop the stack while preserving its named volumes:

```sh
deploy/local_compose/scripts/down.sh
```

To also remove the local PostgreSQL and Vault data:

```sh
deploy/local_compose/scripts/down.sh --volumes
```

See [the local deployment guide](docs/local-deployment.md) for the topology,
network model, environment overrides, and reset procedure.

## Deployment options

| Target           | Location                                         | Purpose                                                                                  |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Local Compose    | [`deploy/local_compose/`](deploy/local_compose/) | Operator, provider, consumer, shared local PostgreSQL, and role-specific Vault instances |
| Local Kubernetes | [`deploy/local_k8s/`](deploy/local_k8s/)         | Rancher Desktop reference deployment using the reusable Helm charts                      |
| Docker Compose   | [`deploy/compose/`](deploy/compose/)             | Reusable operator and participant applications published as OCI artifacts                |
| Kubernetes       | [`deploy/helm/`](deploy/helm/)                   | Operator and participant Helm charts                                                     |
| PostgreSQL       | [`deploy/database/`](deploy/database/)           | Convergent database and restricted-role provisioning scripts                             |

The reusable Compose applications and Helm charts intentionally exclude
PostgreSQL and Vault. A deployment must provision those services and inject the
required application credentials. Both local environments supply
development-only infrastructure with isolated databases, roles, Vault mounts,
and credentials.

Database provisioning and application schema migration are separate lifecycle
steps. See [the database guide](deploy/database/README.md) for the role model and
production run order.

## Repository layout

```text
apps/
  operator-console/                Internal operator UI and admin API
  operator-onboarding-service/     Public participant onboarding API
  participant-init/                Participant Identity Hub and EDC initialization image
  participant-portal/              Participant portal, onboarding UI, and backend
packages/
  core/                            Shared domain, API, and database migration code
  ui-runtime/                      Shared runtime support for the web applications
deploy/
  compose/                         Reusable Compose applications
  database/                        PostgreSQL provisioning and role hardening
  helm/                            Operator and participant Helm charts
  local_compose/                   Coordinated local Compose deployment and lifecycle scripts
  local_k8s/                       Rancher Desktop Kubernetes reference environment
docs/                              Architecture and deployment documentation
```

The participant portal UI, onboarding UI, and Fastify backend are packaged as
one participant-facing runtime. Compose retains the
`participant-portal-backend` service and image variable names for deployment
compatibility.

## Development

The repository uses Node.js 26 with npm 12 and Python 3.12 with uv. The complete
verification command also requires Docker Compose v2 and Helm 4.2.1. Install the
locked dependencies, then run the same quality gate used by CI:

```sh
nvm use
npm ci
uv sync --locked --project apps/federated-catalog
npm run verify
```

`npm run verify` builds, lints, type-checks, and tests the TypeScript and Python
applications, validates every tracked shell script, renders the local Compose
environments, and lints and renders both Helm charts. Individual applications
also expose workspace-specific commands through their `package.json` files.

All repository-owned components follow one lockstep stack version. See
[Versioning and releases](docs/versioning.md) before preparing a release.

## Documentation

- [Deployment artifacts and lifecycle](deploy/README.md)
- [Helm charts](deploy/helm/README.md)
- [Operator stack](docs/operator.md)
- [Participant stack](docs/participant.md)
- [Local Compose deployment](docs/local-deployment.md)
- [Local Kubernetes deployment](deploy/local_k8s/README.md)
- [PostgreSQL provisioning](deploy/database/README.md)
- [Versioning and releases](docs/versioning.md)

## License

Copyright (c) 2026 Deutsches Forschungszentrum für Künstliche Intelligenz
(DFKI). Licensed under the [MIT License](LICENSE).
