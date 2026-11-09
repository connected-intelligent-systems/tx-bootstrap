# Local Compose deployment

Run one operator, one provider, and one consumer on your machine. The demo
includes PostgreSQL, a separate Vault for each role, and authenticated
participant portals. For Rancher Desktop, see
[Local Kubernetes](../deploy/local_k8s/README.md).

## Start and verify

You need Docker with Compose v2 and internet access for image builds and
bootstrap tools. Run from the repository root:

```sh
deploy/local_compose/scripts/up.sh
deploy/local_compose/scripts/bootstrap.sh
deploy/local_compose/scripts/e2e.sh
```

- `up.sh` builds the local images and starts the infrastructure and applications.
- `bootstrap.sh` creates the demo participants, prepares a provider asset, and
  completes onboarding. Rerunning it recreates the demo onboarding records.
- `e2e.sh` checks authentication, catalog access, contract negotiation, and a
  data transfer.

The first build can take a while. Wait for the application services to become
healthy before bootstrapping. The startup script prints the service URLs.

## Open the portals

| Service              | Default URL              | Authentication        |
| -------------------- | ------------------------ | --------------------- |
| Operator console     | <http://localhost:39080> | Local loopback access |
| Provider portal      | <http://localhost:29283> | Basic Auth            |
| Consumer portal      | <http://localhost:19283> | Basic Auth            |
| Provider machine API | <http://localhost:29282> | Scoped bearer token   |
| Consumer machine API | <http://localhost:19282> | Scoped bearer token   |

The local portal login is `admin` / `local-admin-password`. These credentials
and the HTTP-only setup are for local development. Use HTTPS and an
authentication proxy for externally reachable deployments.

Create machine-client tokens under **Settings → API clients** in a participant
portal. The machine gateways serve `/api/management`, `/api/federated-catalog`,
and `/api/data/`; `/api/openapi.json` describes the available operations.
See [Participant API access](participant.md#api-access).

## Configure the demo

The scripts use [local.env.example](../deploy/local_compose/local.env.example)
by default. To use a custom copy, export its absolute path before running any
of the lifecycle commands:

```sh
export TX_BOOTSTRAP_ENV_FILE=/absolute/path/to/local.env
```

Keep files containing your own credentials outside version control. The
example selects in-repository Compose manifests and locally built application
images. Change its image references to test published builds.

`PROVIDER_DEMO_ASSET_URL` defaults to the bundled
`http://demo-data-api:8080/data` service. Set it to another reachable endpoint
to use your own demo data.

To change the portal login, generate a bcrypt entry:

```sh
htpasswd -nbB admin 'new-password'
```

Update `PORTAL_BASIC_AUTH_USERS`, `PORTAL_ADMIN_USERNAME`, and
`PORTAL_ADMIN_PASSWORD` together in your environment file. Single-quote the
htpasswd value so its dollar signs remain literal.

## Stop or reset

Stop the stack and keep its PostgreSQL and Vault data:

```sh
deploy/local_compose/scripts/down.sh
```

A later `up.sh` reuses the stored data. Local Vault unsealing is automated for
this demo; reusable deployments must manage Vault themselves.

To delete the local demo data as well:

```sh
deploy/local_compose/scripts/down.sh --volumes
```

This removes the stack's current PostgreSQL and Vault volumes. Add
`REMOVE_NETWORK=1` to remove the shared Docker network too.

If upgrading from the older layout with a PostgreSQL container per role,
reset the demo before starting the shared-database layout. Old database
volumes cannot be merged automatically. Reset Vault together with PostgreSQL
to avoid keeping keys for deleted wallet contexts; unused legacy volumes may
still need separate removal.

## Deployment model

The roles share one PostgreSQL server but use separate databases, credentials,
and Vaults. Docker networks separate backend traffic from public protocol
endpoints. The local public network simulates connectivity between the three
organizations.

For deployments beyond this demo, use the [deployment guide](../deploy/README.md).
Optional [local tunnel mode](participant-tunnel.md#local-tunnel-mode) exercises
a consumer that receives public traffic through the operator's tunnel.
