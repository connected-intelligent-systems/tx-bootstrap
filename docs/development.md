# Development

The repository uses Node.js 26 with npm 12 and Python 3.12 with uv. Full
verification also requires Docker Compose v2 and Helm 4.2.1.

From the repository root, install the locked dependencies and run the quality
gate used by CI:

```sh
nvm use
npm ci
uv sync --locked --project apps/federated-catalog
npm run verify
```

`npm run verify` builds, lints, type-checks, and tests the TypeScript and Python
applications, validates tracked shell scripts, renders the local Compose
environments, and lints and renders both Helm charts. The
[documentation workflow](documentation.md) builds the MkDocs site separately.

## Repository layout

| Path                                | Contents                                                          |
| ----------------------------------- | ----------------------------------------------------------------- |
| `apps/operator-console/`            | Internal operator UI and admin API                                |
| `apps/operator-onboarding-service/` | Public participant onboarding API                                 |
| `apps/participant-init/`            | Participant Identity Hub and EDC initialization                   |
| `apps/edc-dataplane/`               | Optional S3 HTTP-pull data-plane extension image                  |
| `apps/federated-catalog/`           | Participant-owned catalog snapshot service                        |
| `apps/participant-portal/`          | Participant UI, onboarding, and backend                           |
| `packages/core/`                    | Shared domain, API, and database migration code                   |
| `packages/ui-runtime/`              | Shared runtime support for web applications                       |
| `deploy/`                           | Compose packages, Helm charts, database tooling, and local stacks |
| `docs/`                             | Documentation pages and release notes                             |

## Application guides

- [Operator console](../apps/operator-console/README.md)
- [Federated catalog](../apps/federated-catalog/README.md)
- [Optional S3 data-plane image](../apps/edc-dataplane/README.md)
- [Participant API generation](../apps/participant-portal/server/src/openapi/README.md)

Individual applications expose workspace-specific build and test commands.
Before preparing a release, follow [Versioning and releases](versioning.md).
