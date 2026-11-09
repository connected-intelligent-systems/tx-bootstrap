#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_commands helm kubectl
check_context

helm_major="$(helm version --template '{{.Version}}' | sed -E 's/^v([0-9]+).*/\1/')"
helm_wait_flags=(--wait)
if [ "$helm_major" -ge 4 ]; then
    # Match install-apps.sh: Helm 4's watcher can stall on deleted resources.
    helm_wait_flags=(--wait=legacy)
fi

remove_volumes=false
if [ "${1:-}" = "--volumes" ]; then
    remove_volumes=true
elif [ "$#" -gt 0 ]; then
    echo "Usage: $0 [--volumes]" >&2
    exit 2
fi

for release_namespace in \
    "consumer:tx-consumer" \
    "provider:tx-provider" \
    "operator:tx-operator"; do
    release="${release_namespace%%:*}"
    namespace="${release_namespace#*:}"
    helm --kube-context "$KUBE_CONTEXT" uninstall "$release" \
        --namespace "$namespace" \
        --ignore-not-found \
        "${helm_wait_flags[@]}"
done

if [ "$remove_volumes" = "true" ]; then
    helm --kube-context "$KUBE_CONTEXT" uninstall vault \
        --namespace tx-infra \
        --ignore-not-found \
        "${helm_wait_flags[@]}"
    kubectl --context "$KUBE_CONTEXT" delete namespace \
        tx-operator tx-provider tx-consumer tx-infra \
        --ignore-not-found \
        --wait=true
    helm --kube-context "$KUBE_CONTEXT" uninstall cnpg \
        --namespace cnpg-system \
        --ignore-not-found \
        "${helm_wait_flags[@]}"
    kubectl --context "$KUBE_CONTEXT" delete namespace cnpg-system \
        --ignore-not-found \
        --wait=true
    echo "Local Kubernetes applications, infrastructure, and volumes were removed."
else
    echo "Local Kubernetes applications were removed; PostgreSQL and Vault data were retained."
fi
