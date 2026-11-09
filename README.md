# tx-bootstrap

Bootstrap and deployment tooling for a Tractus-X-style dataspace, intended for
development and research.

The repository includes operator services, participant connectors and portals,
and a complete local demo with one operator, one provider, and one consumer.
Reusable Docker Compose applications and Helm charts support deployments with
externally managed PostgreSQL and Vault.

## Quick start

Install Docker with Compose v2, then run from the repository root:

```sh
deploy/local_compose/scripts/up.sh
deploy/local_compose/scripts/bootstrap.sh
deploy/local_compose/scripts/e2e.sh
```

The startup script builds the application images and prints the local URLs.
The provider and consumer portals use `admin` / `local-admin-password` for this
local demo only.

Stop the stack while keeping its data:

```sh
deploy/local_compose/scripts/down.sh
```

See the [Local Compose guide](docs/local-deployment.md) for configuration,
service URLs, and resetting the demo.

## Documentation

The [documentation site](https://connected-intelligent-systems.github.io/tx-bootstrap/)
is built with MkDocs and deployed from `main` through GitHub Actions.

- [Local Compose](docs/local-deployment.md) and [Local Kubernetes](deploy/local_k8s/README.md)
- [Deployment options](deploy/README.md) and [Helm charts](deploy/helm/README.md)
- [Operator services](docs/operator.md) and [Participant runtime](docs/participant.md)
- [Participant tunnel](docs/participant-tunnel.md)
- [S3 HTTP-pull](docs/s3-http-pull.md)
- [Development](docs/development.md), [releases](docs/versioning.md), and [editing the docs](docs/documentation.md)

## License

Copyright (c) 2026 Deutsches Forschungszentrum für Künstliche Intelligenz
(DFKI). Licensed under the [MIT License](LICENSE).
