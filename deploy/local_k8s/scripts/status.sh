#!/bin/bash
set -euo pipefail

# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_commands helm kubectl
check_context

echo "Helm releases:"
helm --kube-context "$KUBE_CONTEXT" list --all-namespaces

echo
echo "Infrastructure:"
kubectl --context "$KUBE_CONTEXT" --namespace tx-infra get cluster,pods,services,persistentvolumeclaims,jobs

for namespace in tx-operator tx-provider tx-consumer; do
    echo
    echo "${namespace}:"
    kubectl --context "$KUBE_CONTEXT" --namespace "$namespace" get deployments,statefulsets,pods,services,ingresses,jobs
done
