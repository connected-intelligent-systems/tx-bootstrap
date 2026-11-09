# Development

## Set up

Use Node.js 26, npm 12, Python 3.12, and uv. The complete verification command
also needs Docker Compose v2 and Helm 4.2.1, matching CI.

Run from the repository root:

```sh
nvm use
npm ci
uv sync --locked --project apps/federated-catalog
npm run verify
```

`npm run verify` builds and checks the applications, runs their tests,
validates shell scripts, and checks the Compose and Helm deployments.
[Documentation builds](documentation.md) run separately.

## Work on one application

Use npm workspaces to run an application's scripts. For example:

```sh
npm run build --workspace @tx-bootstrap/operator-console
npm run test --workspace @tx-bootstrap/operator-console
```

Use [the local stack](local-deployment.md) to check changes that depend on
PostgreSQL, Vault, or other dataspace services. Its startup script builds the
local application images from your checkout.

Application-specific notes:

- [Operator console](../apps/operator-console/README.md)
- [Federated catalog](../apps/federated-catalog/README.md)
- [Optional S3 data-plane image](../apps/edc-dataplane/README.md)
- [Participant API generation](../apps/participant-portal/server/src/openapi/README.md)

## Repository layout

| Directory                                    | Contents                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/`                                      | Operator console, onboarding API, participant portal, catalog, and helper images |
| `packages/`                                  | Shared domain code, migrations, and UI runtime support                           |
| `deploy/compose/`                            | Reusable Compose applications                                                    |
| `deploy/helm/`                               | Operator and participant Helm charts                                             |
| `deploy/database/`                           | Database provisioning scripts                                                    |
| `deploy/local_compose/`, `deploy/local_k8s/` | Local reference environments                                                     |
| `docs/`                                      | User guides and release notes                                                    |

Keep related documentation changes with the code. Before preparing a release,
follow [Versioning and releases](versioning.md).
