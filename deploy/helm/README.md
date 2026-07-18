# Helm deployments

Helm charts are the production-oriented deployment format. They deliberately do
not install PostgreSQL or Vault: those services and the Kubernetes Secret named
by each chart must exist before installation.

Available charts:

- [`operator`](operator/README.md) – operator console, onboarding service,
  Identity Hub, Issuer Service, BDRS, DID gateway, and database lifecycle Jobs.
- [`participant`](participant/README.md) – participant Identity Hub, EDC control
  and data planes, participant-local federated catalog, scoped portal gateway,
  public/internal gateways, and initialization Jobs.

Published OCI references:

- `oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-charts/tx-bootstrap-operator`
- `oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-charts/tx-bootstrap-participant`

Select an explicit chart version when pulling or installing. For example:

```sh
helm show chart \
  oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-charts/tx-bootstrap-operator \
  --version 0.1.0
```

The chart workflow publishes validated packages from `main` with an immutable
development version such as `0.1.0-dev.sha<commit>` and the matching
`sha-<commit>` application-image tag. A Git tag such as `v0.1.0` publishes the
stable `0.1.0` chart only when it matches `Chart.yaml`; its default images use
the matching `0.1.0` release tag. Rerunning an unchanged version is safe, while
attempting to replace an existing version with different contents fails.

GitHub Container Registry creates new packages as private by default. After the
first publication, the package owner must make both chart packages public once
if anonymous installation is required.

Both charts can be rendered and packaged without a cluster. The
[`local_k8s`](../local_k8s/README.md) environment deploys both charts to Rancher
Desktop, enforces the Restricted Pod Security Standard for application
namespaces, and runs operator/provider/consumer smoke checks. A consuming
project must still validate its environment-specific ingress, TLS, secrets,
network policy, storage, and external service integration.

Repo-owned images default to the chart `appVersion`, and chart schemas reject
floating `latest`, `main`, and `master` tags for those components. Consuming
projects should replace defaults with a published release tag or, preferably,
a `sha256:` digest. Local reference values use the explicit `local` tag and
never pull from a registry.
