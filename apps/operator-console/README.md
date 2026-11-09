# Operator console

The internal operator UI and API manage participants, invitations, connector
setup, and optional tunnel enrollment. The public onboarding API is a separate
service. Keep this console on an authenticated administrative network.

See [Operator services](../../docs/operator.md) for deployment and day-to-day
use. The [local stack](../../docs/local-deployment.md) provides the required
databases, Vault, and upstream services.

## Development

After the [repository setup](../../docs/development.md#set-up), run from the
repository root:

```sh
npm run build --workspace @tx-bootstrap/operator-console
npm run test --workspace @tx-bootstrap/operator-console
```

To run the built backend and Vite UI, use separate terminals with the required
backend environment configured:

```sh
npm run start --workspace @tx-bootstrap/operator-console
```

```sh
npm run dev --workspace @tx-bootstrap/operator-console
```
