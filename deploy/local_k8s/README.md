# Local Kubernetes deployment

This environment deploys the reusable tx-bootstrap Helm charts to the Rancher
Desktop Kubernetes cluster. It is the Kubernetes counterpart to
`deploy/local_compose` and is intended for integration and production-readiness
validation, not as a highly available production platform.

The environment uses:

- the existing Rancher Desktop K3s cluster and Traefik ingress controller
- one single-instance CloudNativePG cluster with isolated databases and roles
- one persistent standalone Vault with isolated KV mounts and tokens
- separate namespaces for infrastructure, operator, provider, and consumer
- the reusable charts under `deploy/helm`

The three application namespaces enforce the Kubernetes Restricted Pod
Security Standard. `tx-infra` enforces Baseline and audits/warns against
Restricted because the local upstream Vault and CloudNativePG installations
own their security contexts independently of the tx-bootstrap charts.

PostgreSQL and Vault remain outside the operator and participant charts. The
single-node topology and `local-path` storage are local-test limitations. A
production environment must choose its own availability, backup, storage,
auto-unseal, TLS, and secret-delivery design.

## Prerequisites

- Rancher Desktop Kubernetes context named `rancher-desktop`
- `kubectl`, Helm, Docker, `jq`, and `openssl`
- enough Rancher Desktop memory for the operator and two participants
- network access to the configured image and Helm repositories

The committed `local.env.example` contains local-only credentials. Override it
with `TX_BOOTSTRAP_K8S_ENV_FILE` if required; never reuse these credentials
outside this local cluster.

## Lifecycle

Install infrastructure and applications:

```sh
deploy/local_k8s/scripts/up.sh
```

Inspect the deployment:

```sh
deploy/local_k8s/scripts/status.sh
deploy/local_k8s/scripts/verify.sh
```

Remove the application releases while retaining PostgreSQL and Vault data:

```sh
deploy/local_k8s/scripts/down.sh
```

Pass `--volumes` to also remove the local infrastructure releases, namespaces,
and persistent volumes. This permanently deletes the local Kubernetes state.

## Local endpoints

The default hostnames use the Rancher Desktop load-balancer IP through
`nip.io`. Override `LOCAL_K8S_INGRESS_IP` before running the scripts when that
address changes. `up.sh` renders environment-owned values from the templates
under `values/`; generated values and credentials are written only below the
ignored `.generated/` directory.

TLS is deliberately disabled for this local cluster. The reusable charts keep
HTTPS defaults, and a non-local environment must configure real DNS names and
TLS Secrets.
