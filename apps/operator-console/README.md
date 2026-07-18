# Operator Console

Internal UI and backend for operator-owned participant management, automatic connector provisioning, BDRS writes, issuer setup, failed-attempt retries, and credential request preparation.

The public operator onboarding service lives in `../operator-onboarding-service`; do not expose this operator service directly to the internet.

## Development

From the repository root:

```bash
npm install
npm run build --workspace @tx-bootstrap/operator-console
npm run test --workspace @tx-bootstrap/operator-console
```

To run the built server and Vite UI manually:

```bash
npm run build:server --workspace @tx-bootstrap/operator-console
npm run start --workspace @tx-bootstrap/operator-console
npm run dev --workspace @tx-bootstrap/operator-console
```

The app uses Vite, React, MUI, TanStack Query, Fastify, Kysely, and explicit SQL migrations run by the root `db-migrator` service.
