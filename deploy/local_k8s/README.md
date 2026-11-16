# Local Kubernetes deployment

Run an operator, a provider, and a consumer on Rancher Desktop using the
reusable Helm charts. The scripts also install one PostgreSQL cluster and
one persistent Vault with isolated databases, credentials, and secret mounts.
This environment is intended for local integration testing.

## Prerequisites

- Rancher Desktop with Kubernetes and its Traefik ingress controller enabled
- current Kubernetes context set to `rancher-desktop`
- Docker, `kubectl`, Helm 4.2.1, `jq`, and `openssl`
- enough memory for the operator and both participants
- access to the configured image and chart repositories

The scripts use [local.env.example](local.env.example). To use a custom copy,
export `TX_BOOTSTRAP_K8S_ENV_FILE` with its absolute path. The committed
credentials are for this local cluster only.

## Start and inspect

Run from the repository root:

```sh
deploy/local_k8s/scripts/up.sh
```

The script provisions infrastructure, builds local images, installs the
applications, and runs verification. Inspect or repeat the checks with:

```sh
deploy/local_k8s/scripts/status.sh
deploy/local_k8s/scripts/verify.sh
```

## Access and configuration

Hostnames and DIDs use `nip.io` names for `LOCAL_K8S_INGRESS_IP`. Unless your
environment file sets it, the first installation reads the address of Rancher
Desktop's Traefik service and keeps it in `.generated/ingress-ip` until
`down.sh --volumes`. Host-side checks connect through
`LOCAL_K8S_INGRESS_CONNECT_IP`, which defaults to `127.0.0.1` for Rancher
Desktop's port forwarding.

Rancher Desktop can assign its VM a new address after a restart. The
participants then no longer reach each other, and `verify.sh` reports the old
and new address. Reinstall with `down.sh --volumes` and `up.sh`, or add the old
address in the VM until its next restart:

```sh
rdctl shell sudo ip addr add <old address>/32 dev vznat
```

Generated values and credentials are stored under the ignored `.generated/`
directory. TLS is disabled locally; configure real DNS and TLS for other
clusters.

## Stop or reset

Remove application releases while keeping PostgreSQL and Vault data:

```sh
deploy/local_k8s/scripts/down.sh
```

To delete local infrastructure and persistent state too:

```sh
deploy/local_k8s/scripts/down.sh --volumes
```

Vault automatically unseals using a key stored in the same cluster. This
convenience, single-instance infrastructure, and local storage are for local
tests. A deployed environment needs its own backup, availability, TLS, secret
management, and Vault unsealing arrangements.
