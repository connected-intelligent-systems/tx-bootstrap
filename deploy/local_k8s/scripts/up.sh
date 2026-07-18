#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_commands docker helm jq kubectl openssl sed
check_context

kubectl --context "$KUBE_CONTEXT" apply -f "$K8S_DIR/namespaces.yaml"

helm repo add cnpg https://cloudnative-pg.github.io/charts --force-update
helm repo add hashicorp https://helm.releases.hashicorp.com --force-update
helm repo update cnpg hashicorp

helm --kube-context "$KUBE_CONTEXT" upgrade --install cnpg \
    cnpg/cloudnative-pg \
    --version "$CNPG_CHART_VERSION" \
    --namespace cnpg-system \
    --create-namespace \
    --wait \
    --timeout 10m

kubectl --context "$KUBE_CONTEXT" \
    --namespace cnpg-system \
    rollout status deployment/cnpg-cloudnative-pg --timeout=5m

postgres_manifest="$GENERATED_DIR/postgres-cluster.yaml"
sed "s/size: 8Gi/size: ${POSTGRES_STORAGE_SIZE}/" \
    "$K8S_DIR/postgres/cluster.yaml" >"$postgres_manifest"
kubectl --context "$KUBE_CONTEXT" apply -f "$postgres_manifest"
kubectl --context "$KUBE_CONTEXT" \
    --namespace tx-infra \
    wait --for=condition=Ready cluster/tx-postgres --timeout=10m

helm --kube-context "$KUBE_CONTEXT" upgrade --install vault \
    hashicorp/vault \
    --version "$VAULT_CHART_VERSION" \
    --namespace tx-infra \
    --values "$K8S_DIR/vault/values.yaml" \
    --set "server.dataStorage.size=${VAULT_STORAGE_SIZE}" \
    --timeout 10m

"$SCRIPT_DIR/create-secrets.sh"
"$SCRIPT_DIR/configure-databases.sh"
"$SCRIPT_DIR/configure-vault.sh"
"$SCRIPT_DIR/build-images.sh"
"$SCRIPT_DIR/install-apps.sh"
"$SCRIPT_DIR/verify.sh"

echo
echo "tx-bootstrap local Kubernetes deployment is ready."
