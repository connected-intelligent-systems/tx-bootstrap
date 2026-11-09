# tx-bootstrap

Build a Tractus-X-style dataspace with operator services, participant
connectors, and web portals. tx-bootstrap provides a complete local demo and
reusable deployment packages for development and research.

## Start here

The [Local Compose guide](local-deployment.md) starts an operator, a provider,
and a consumer, then verifies a data exchange. It is the quickest way to try
the project. Use [Local Kubernetes](../deploy/local_k8s/README.md) to run the
same roles on Rancher Desktop.

## How it fits together

The **operator** manages participant invitations, credential issuance, and the
Business Partner DID Resolution Service (BDRS), which maps participant
identifiers to their DIDs. A DID is the public identity used by a connector.

Each **participant** runs its own identity wallet, Tractus-X EDC connector,
catalog, and portal. The portal handles onboarding and data exchange.
Provider and consumer are two participants in the local demo; each keeps its
own identity, credentials, and data.

Local environments include PostgreSQL and Vault. Reusable Compose applications
and Helm charts connect to PostgreSQL and Vault supplied by your platform.

## Guides

| Goal                                         | Guide                                                   |
| -------------------------------------------- | ------------------------------------------------------- |
| Choose a deployment format                   | [Deployment options](../deploy/README.md)               |
| Deploy to Kubernetes                         | [Helm charts](../deploy/helm/README.md)                 |
| Prepare databases                            | [PostgreSQL provisioning](../deploy/database/README.md) |
| Manage participants and invitations          | [Operator services](operator.md)                        |
| Onboard and use a connector                  | [Participant runtime](participant.md)                   |
| Connect a participant without public ingress | [Participant tunnel](participant-tunnel.md)             |
| Share objects from S3 storage                | [S3 HTTP-pull](s3-http-pull.md)                         |
| Build or change the project                  | [Development](development.md)                           |

See [Versioning and releases](versioning.md) for release notes and artifact
versions. Source code is available on
[GitHub](https://github.com/connected-intelligent-systems/tx-bootstrap) under
the [MIT License](../LICENSE).
