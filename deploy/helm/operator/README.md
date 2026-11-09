# Operator chart

Deploy the operator console, public onboarding API, issuer services, BDRS,
and issuer DID gateway. PostgreSQL and Vault must be provisioned separately.
See the [shared Helm prerequisites](../README.md#before-installation).

## Configure

Use [values.yaml](values.yaml) as the settings reference. Prepare your own
values file with:

- issuer BPN, its base64 encoding, and public DID hostname
- Vault URL and pre-provisioned AES keys matching
  `issuerIdentityHub.encryptionKeyAlias` and `issuerService.encryptionKeyAlias`
- the existing Secret name and key mappings
- console authentication and allowed onboarding origins
- ingress hosts, TLS, image versions, resources, and storage requirements

Keep the console ingress administrative. Publish the onboarding API and issuer
gateway as described in [Operator services](../../../docs/operator.md).

Console authentication supports `api-key` or `forwarded-header`. In API-key
mode the web console asks for the key and keeps it for the browser tab only.
Header mode requires a trusted authentication proxy that overwrites caller
identity headers.

## Required Secret

Create the namespace and the Secret named by `existingSecret.name` before
installation. The chart reads the Secret; it does not create it. Map alternative
key names through `existingSecret.keys`.

| Default key                                            | Purpose                                              |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `vault-token`                                          | Scoped Vault token                                   |
| `identityhub-jdbc-url`                                 | Issuer Identity Hub database URL                     |
| `identityhub-db-user`, `identityhub-db-password`       | Identity Hub database login                          |
| `issuer-service-jdbc-url`                              | Issuer Service database URL                          |
| `issuer-service-db-user`, `issuer-service-db-password` | Issuer Service database login                        |
| `bdrs-jdbc-url`                                        | BDRS database URL                                    |
| `bdrs-db-user`, `bdrs-db-password`                     | BDRS database login                                  |
| `operator-migrator-database-url`                       | Operator application migration login                 |
| `operator-console-database-url`                        | Console runtime login                                |
| `onboarding-database-url`                              | Onboarding runtime login                             |
| `issuer-migrator-database-url`                         | Issuer database owner login for the claims grant job |
| `issuer-claims-database-url`                           | Restricted issuer claims login                       |
| `bdrs-api-key`                                         | BDRS management API key                              |
| `operator-console-api-key`                             | Required for `api-key` console authentication        |

`issuerApiKey` is optional; an empty mapping lets the console read it from
Vault. Use TLS-enabled database connections and keep cluster-administrator
credentials out of this Secret. The
[database provisioner](../../database/operator/provision.sh) creates the
required roles.

## Install

From the repository root, validate your settings:

```sh
helm lint --strict deploy/helm/operator --values /path/to/operator-values.yaml
helm template operator deploy/helm/operator \
  --namespace tx-operator --values /path/to/operator-values.yaml
```

Once databases, Vault, namespace, Secret, and ingress are ready:

```sh
helm upgrade --install operator deploy/helm/operator \
  --namespace tx-operator \
  --values /path/to/operator-values.yaml \
  --rollback-on-failure --wait=legacy --wait-for-jobs --timeout 15m
```

For a published package, replace the chart path with
`oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-charts/tx-bootstrap-operator`
and add an explicit `--version`. See
[chart versions and Helm compatibility](../README.md#versions).

Migration jobs run during installation and upgrades. Failed jobs are retained
for inspection; successful hook jobs are removed. To investigate a failure:

```sh
kubectl -n tx-operator get jobs,pods
kubectl -n tx-operator logs -l app.kubernetes.io/component=db-migrator
kubectl -n tx-operator logs -l app.kubernetes.io/component=issuer-claims-grant
```

## Optional tunnel enrollment

To manage participant tunnel keys, configure:

- `operatorConsole.headscale.enabled: true`
- `operatorConsole.headscale.url`: the external Headscale HTTPS URL
- `operatorConsole.headscale.participantDomain`: the public participant DNS zone
- `existingSecret.keys.headscaleApiKey`: the Secret key containing the
  administrative Headscale API token

Only the console receives this token. Configure the Headscale server and
policy separately; see [Participant tunnel](../../../docs/participant-tunnel.md#operator).
