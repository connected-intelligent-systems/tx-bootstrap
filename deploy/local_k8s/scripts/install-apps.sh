#!/bin/bash
set -euo pipefail

# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_commands helm kubectl
check_context

helm_major="$(helm version --template '{{.Version}}' | sed -E 's/^v([0-9]+).*/\1/')"
helm_rollout_flags=(--atomic --wait)
if [ "$helm_major" -ge 4 ]; then
    # Helm 4's watcher wait strategy can stall while deleting completed hook
    # Jobs. The legacy strategy retains Helm 3's proven polling semantics.
    helm_rollout_flags=(--rollback-on-failure --wait=legacy)
fi

operator_values="$GENERATED_DIR/operator-values.yaml"
provider_values="$GENERATED_DIR/provider-values.yaml"
consumer_values="$GENERATED_DIR/consumer-values.yaml"

render_values "$K8S_DIR/values/operator.yaml" "$operator_values"
render_values "$K8S_DIR/values/provider.yaml" "$provider_values"
render_values "$K8S_DIR/values/consumer.yaml" "$consumer_values"

helm lint --strict "$ROOT/deploy/helm/operator" --values "$operator_values"
helm lint --strict "$ROOT/deploy/helm/participant" --values "$provider_values"
helm lint --strict "$ROOT/deploy/helm/participant" --values "$consumer_values"

helm --kube-context "$KUBE_CONTEXT" upgrade --install operator \
    "$ROOT/deploy/helm/operator" \
    --namespace tx-operator \
    --values "$operator_values" \
    "${helm_rollout_flags[@]}" \
    --wait-for-jobs \
    --timeout 20m

helm --kube-context "$KUBE_CONTEXT" upgrade --install provider \
    "$ROOT/deploy/helm/participant" \
    --namespace tx-provider \
    --values "$provider_values" \
    "${helm_rollout_flags[@]}" \
    --wait-for-jobs \
    --timeout 20m

helm --kube-context "$KUBE_CONTEXT" upgrade --install consumer \
    "$ROOT/deploy/helm/participant" \
    --namespace tx-consumer \
    --values "$consumer_values" \
    "${helm_rollout_flags[@]}" \
    --wait-for-jobs \
    --timeout 20m

echo "Operator, provider, and consumer Helm releases are installed."
