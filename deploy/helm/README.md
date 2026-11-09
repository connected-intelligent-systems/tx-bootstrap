# Helm charts

The charts deploy operator and participant applications to Kubernetes 1.27 or
newer. They require externally managed PostgreSQL and Vault.

| Chart       | Guide                                      | Published OCI reference                                                                    |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Operator    | [Operator chart](operator/README.md)       | `oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-charts/tx-bootstrap-operator`    |
| Participant | [Participant chart](participant/README.md) | `oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-charts/tx-bootstrap-participant` |

For a complete local installation, use
[Local Kubernetes](../local_k8s/README.md).

## Before installation

1. [Provision PostgreSQL databases](../database/README.md) and Vault secrets.
2. Create the namespace and the existing Kubernetes Secret required by the
   chart. Secrets must exist before the migration hooks run.
3. Prepare an environment-owned values file with identity, public endpoints,
   authentication, ingress, TLS, and storage settings.
4. Review image versions, resources, and network policies for your platform.

The chart-specific guides list required Secret keys. Their `values.yaml`
files provide the complete settings reference. Do not commit real credentials.

Both charts use non-root containers with restricted security contexts. When
replacing an image, check that its user and group match the configured
`securityContext`.

## Versions

Charts and repository-owned images share the stack version in
[`VERSION`](../../VERSION). Use an explicitly published release or immutable
development version; see [Versioning](../../docs/versioning.md).

For example, inspect a published chart matching your checkout:

```sh
helm show chart \
  oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-charts/tx-bootstrap-operator \
  --version "$(cat VERSION)"
```

Run from the repository root and confirm that version has been published.
When installing from OCI, add the same `--version` option. If packages are
private, authenticate to GHCR or make them public for anonymous installation.

Repository-owned images default to the chart's `appVersion`. Override with a
published tag or digest when needed; floating tags are rejected for those
images. Local reference values use locally built images.

## Helm compatibility

The installation commands in these guides target Helm 4.2.1, matching CI.
They use `--wait=legacy` because completed migration hooks are removed after
success. With Helm 3, replace `--rollback-on-failure --wait=legacy` with
`--atomic --wait`.

Network policies, availability, and scaling depend on your cluster and external
services. Validate them for your environment before increasing replica counts.
