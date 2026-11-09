# tx-bootstrap

Bootstrap, deploy, and operate a Tractus-X-style dataspace from one repository.
tx-bootstrap combines operator and participant applications with reusable
Docker Compose packages, Kubernetes Helm charts, database provisioning, and
complete local demo environments for development and research.

## Start a local dataspace

With Docker and Compose v2 installed, run these commands from the repository
root to start an operator, a provider, and a consumer, onboard the demo
participants, and verify a data exchange:

```sh
deploy/local_compose/scripts/up.sh
deploy/local_compose/scripts/bootstrap.sh
deploy/local_compose/scripts/e2e.sh
```

The startup script builds the repository-owned images and prints the service
URLs. Follow the [Local Compose guide](local-deployment.md) for configuration,
authentication, persistence, and shutdown. For Rancher Desktop, use the
[Local Kubernetes guide](../deploy/local_k8s/README.md).

## Choose your next step

| Goal                                            | Guide                                                   |
| ----------------------------------------------- | ------------------------------------------------------- |
| Understand deployment packages and lifecycle    | [Deployment artifacts](../deploy/README.md)             |
| Deploy to Kubernetes                            | [Helm charts](../deploy/helm/README.md)                 |
| Prepare isolated PostgreSQL databases and roles | [PostgreSQL provisioning](../deploy/database/README.md) |
| Run issuer, onboarding, and directory services  | [Operator services](operator.md)                        |
| Configure a participant connector and portal    | [Participant runtime](participant.md)                   |
| Expose a participant through an operator tunnel | [Participant tunnel](participant-tunnel.md)             |
| Transfer S3 data over authenticated HTTP-pull   | [S3 HTTP-pull](s3-http-pull.md)                         |
| Build and verify the applications               | [Development](development.md)                           |

## Architecture and ownership

The **operator** owns the console, public onboarding service, issuer Identity
Hub, Issuer Service, BDRS, and operator DID gateway. Each **participant** owns its
Identity Hub, EDC control and data planes, participant portal, federated
catalog, and public and internal gateways.

The coordinated local environments provide one operator and two isolated
participants. They supply development infrastructure for PostgreSQL and Vault.
Reusable Compose applications and Helm charts require externally provisioned
PostgreSQL and Vault, with credentials injected by the deployment platform.

Database provisioning and application schema migration are separate lifecycle
steps. Read the [database guide](../deploy/database/README.md) before deploying
the reusable packages.

## Releases and source

All repository-owned components share a stack version. See
[Versioning and releases](versioning.md) for stable releases and development
artifacts. The source is available on
[GitHub](https://github.com/connected-intelligent-systems/tx-bootstrap) under
the [MIT License](../LICENSE).
