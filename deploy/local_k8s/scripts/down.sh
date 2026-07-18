#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_commands helm kubectl
check_context

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
        --wait
done

if [ "$remove_volumes" = "true" ]; then
    helm --kube-context "$KUBE_CONTEXT" uninstall vault \
        --namespace tx-infra \
        --ignore-not-found \
        --wait
    kubectl --context "$KUBE_CONTEXT" delete namespace \
        tx-operator tx-provider tx-consumer tx-infra \
        --ignore-not-found \
        --wait=true
    helm --kube-context "$KUBE_CONTEXT" uninstall cnpg \
        --namespace cnpg-system \
        --ignore-not-found \
        --wait
    kubectl --context "$KUBE_CONTEXT" delete namespace cnpg-system \
        --ignore-not-found \
        --wait=true
    echo "Local Kubernetes applications, infrastructure, and volumes were removed."
else
    echo "Local Kubernetes applications were removed; PostgreSQL and Vault data were retained."
fi
