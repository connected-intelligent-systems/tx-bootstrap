# Deployment options

Choose the environment that matches your task:

| Target                      | Start here                                   |
| --------------------------- | -------------------------------------------- |
| Local Docker demo           | [Local Compose](../docs/local-deployment.md) |
| Rancher Desktop Kubernetes  | [Local Kubernetes](local_k8s/README.md)      |
| Your own Kubernetes cluster | [Helm charts](helm/README.md)                |
| Your own Docker host        | Reusable Compose applications below          |

The local environments supply PostgreSQL and Vault. Reusable Compose
applications and Helm charts require those services from your platform,
including their credentials, storage, and backups.

## Reusable Compose applications

OCI-backed deployments require Docker Compose 2.34.0 or newer. The published
applications are:

| Artifact under `ghcr.io/connected-intelligent-systems/` | Purpose                              |
| ------------------------------------------------------- | ------------------------------------ |
| `tx-bootstrap-operator`                                 | Operator services                    |
| `tx-bootstrap-participant`                              | One participant                      |
| `tx-bootstrap-participant-tunnel`                       | Participant with the tunnel override |
| `tx-bootstrap-tunnel`                                   | Operator's shared tunnel ingress     |

Use a published release version or an immutable development version. See
[Versioning](../docs/versioning.md) for the tag format. Published artifacts
pin their images to digests, so image settings such as
`OPERATOR_CONSOLE_IMAGE` are optional; set them only to run other images.

Before starting a reusable application:

1. [Provision databases and restricted roles](database/README.md).
2. Configure Vault and the secrets described below.
3. Set identity, public endpoint, authentication, database, and image settings
   in a deployment-owned environment file.
4. Configure HTTPS ingress and private administrative access.

The source manifests are the full configuration reference:

- [Operator application](compose/operator.compose.yaml)
- [Participant application](compose/participant.compose.yaml)
- [Tunnel setup](../docs/participant-tunnel.md)

Compose reports missing required settings during validation. For example,
validate and start an operator using the source manifest from this checkout:

```sh
docker compose --env-file /path/to/operator.env \
  -f deploy/compose/operator.compose.yaml config --quiet
docker compose --env-file /path/to/operator.env \
  -f deploy/compose/operator.compose.yaml up -d --wait
```

To use a published package, replace the manifest path with
`oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-operator:VERSION`,
using an actual published version in place of `VERSION`. Participant packages
work the same way.

## Vault setup

Make Vault reachable before starting the application. Provide `VAULT_URL` and
a suitably scoped `VAULT_TOKEN`; the base applications do not initialize Vault.

Provision these aliases in the configured KV mount:

| Application | Required aliases                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Operator    | `password`, `mgmt-api-key`, `edc.datasource.didentry.user`, `edc.datasource.didentry.password`, and configured AES key aliases |
| Participant | `password`, `super-user-apikey`, and the configured AES key alias                                                              |

Give each participant its own KV mount or Vault instance. Initialization
creates participant-specific signing and connector credentials there.

AES aliases must contain base64-encoded 16-, 24-, or 32-byte keys. Keep those
keys stable across restarts and upgrades. Changing them requires re-encryption
of stored data. Existing plaintext data must be migrated before enabling
strict encryption; the `*_ENCRYPTION_STRICT` settings control migration mode.

## Public and private access

Publish only the required [operator](../docs/operator.md#public-and-administrative-access)
and [participant](../docs/participant.md#public-and-private-access) routes.
Keep management APIs and infrastructure private. Participant portals require
an authentication proxy; machine clients use scoped tokens through the portal
backend's API.

The applications create their public Docker networks by default. If your
platform owns the network, add an override. For a participant:

```yaml
networks:
  public:
    external: true
```

Use `edge` for the operator. Set the network name through
`PARTICIPANT_PUBLIC_NETWORK` or `OPERATOR_EDGE_NETWORK`.

For other platform settings, supply your own Compose override. Plan resource
limits, persistent storage, monitoring, and recovery for your environment.
