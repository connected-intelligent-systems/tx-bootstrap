# Participant chart

Deploy one participant's wallet, EDC control and data planes, portal,
federated catalog, gateways, and initialization jobs. PostgreSQL and Vault
must be provisioned separately. See the
[shared Helm prerequisites](../README.md#before-installation).

## Configure

Use [values.yaml](values.yaml) as the full settings reference. Set at least:

- participant BPN, base64 encoding, stable context ID, and public hostnames
- operator issuer, directory, and onboarding endpoints
- Vault URL, an isolated KV mount, and an AES key under
  `identityHub.encryptionKeyAlias`
- existing Secret name and key mappings
- portal authentication, ingress, TLS, storage, and image settings

Each participant needs a separate Vault KV mount or Vault instance so wallet
and connector keys cannot overwrite another participant's credentials.
See [Vault setup](../../README.md#vault-setup).

The optional S3 data-plane image is selected through `dataPlane.image`;
see [S3 HTTP-pull](../../../docs/s3-http-pull.md).

## Required Secret

Create the namespace and the Secret named by `existingSecret.name` before
installation. Map alternative key names through `existingSecret.keys`.

| Default key                                      | Purpose                         |
| ------------------------------------------------ | ------------------------------- |
| `vault-token`                                    | Participant-scoped Vault token  |
| `identityhub-superuser-api-key`                  | Wallet initialization key       |
| `identityhub-jdbc-url`                           | Wallet database URL             |
| `identityhub-db-user`, `identityhub-db-password` | Wallet database login           |
| `edc-jdbc-url`                                   | Connector database URL          |
| `edc-db-user`, `edc-db-password`                 | Connector database login        |
| `portal-migrator-database-url`                   | Portal migration login          |
| `portal-database-url`                            | Restricted portal runtime login |
| `edc-api-key`                                    | EDC management key              |
| `federated-catalog-api-key`                      | Private portal-to-catalog key   |

`identityHubApiKey` and `onboardingRegistrationToken` mappings are optional.
Leaving the wallet key mapping empty lets the portal read it from Vault. An
invitation must be configured or attached before onboarding can proceed.

Use TLS-enabled database URLs and keep cluster-administrator credentials out
of this Secret. The [participant provisioner](../../database/participant/provision.sh)
creates the required databases and roles.

## Public and internal exposure

`ingress.public` publishes the DID, protocol, credential, and data-plane
routes. Include both DID and public hostnames in the ingress and certificate
if they differ.

`ingress.internal` serves the portal, participant-facing API, and wallet
identity routes. Keep it private and authenticated.

Portal authentication defaults to `portal.auth.mode: forwarded-header`.
Configure an authentication proxy that overwrites `portal.auth.header` and
prevents callers from bypassing it. The chart does not install that proxy.
Unauthenticated mode grants administrator access and is restricted to isolated
development with `portal.auth.allowInsecure: true`.

The [participant guide](../../../docs/participant.md#api-access) covers API
clients, scopes, and the OpenAPI contract. Keep HTTPS headers enabled outside
HTTP-only local environments.

Preview, download, and application data proxy requests require public network
addresses by default. For private participant endpoints, explicitly list their
hostnames in `portal.preview.allowedPrivateHosts` (preview and download) and
`portal.dataProxy.allowedPrivateHosts` (application data proxy).

## Install

From the repository root, validate your settings:

```sh
helm lint --strict deploy/helm/participant --values /path/to/participant-values.yaml
helm template participant deploy/helm/participant \
  --namespace tx-participant --values /path/to/participant-values.yaml
```

Once databases, Vault, namespace, Secret, and ingress are ready:

```sh
helm upgrade --install participant deploy/helm/participant \
  --namespace tx-participant \
  --values /path/to/participant-values.yaml \
  --rollback-on-failure --wait=legacy --wait-for-jobs --timeout 15m
```

For a published package, replace the chart path with
`oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-charts/tx-bootstrap-participant`
and add an explicit `--version`. See
[chart versions and Helm compatibility](../README.md#versions).

Portal migrations must complete before the portal starts. Participant
initialization prepares the wallet and connector keys before the control
plane starts. Failed migration jobs are retained for inspection:

```sh
kubectl -n tx-participant get jobs,pods
```

The federated catalog uses one persistent volume per replica. Start with the
default single replica. Additional replicas crawl independently, increasing
outbound requests and potentially returning different snapshots. Never share
one catalog storage directory between processes.

## Operator tunnel

Use the [operator tunnel](../../../docs/participant-tunnel.md) when the
participant cannot accept public inbound connections. Enable `tunnel.enabled`
and disable `ingress.public`. Map the operator's settings as follows:

| Tunnel setting            | Chart value                                     |
| ------------------------- | ----------------------------------------------- |
| `HEADSCALE_URL`           | `tunnel.headscaleUrl`                           |
| `TAILNET_HOSTNAME`        | `tunnel.hostname`                               |
| `PARTICIPANT_PUBLIC_HOST` | `identity.participantPublicHost`                |
| `PARTICIPANT_DID_HOST`    | `identity.participantDidHost`                   |
| Single-use enrollment key | Secret entry named by `tunnel.authKeySecretKey` |

Deliver the key through your secret manager into the existing Secret. The
tunnel terminates TLS at the participant and obtains its own certificate.
`tunnel.tls` controls certificate and request-limit settings; allow outbound
access to Headscale, relay servers, and the certificate authority.

Keep the tunnel's persistent volume across upgrades. It stores the node
identity and certificate and is retained on uninstall. Removing it requires
a new enrollment key.
