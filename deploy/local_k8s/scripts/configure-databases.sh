#!/bin/bash
set -euo pipefail

# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_commands kubectl
check_context

scripts_manifest="$GENERATED_DIR/database-provisioner-scripts.yaml"
sql_manifest="$GENERATED_DIR/database-provisioner-sql.yaml"

kubectl --context "$KUBE_CONTEXT" \
    --namespace tx-infra \
    create configmap tx-database-provisioner-scripts \
    --from-file="provision-lib.sh=$ROOT/deploy/database/provision-lib.sh" \
    --from-file="operator-provision.sh=$ROOT/deploy/database/operator/provision.sh" \
    --from-file="participant-provision.sh=$ROOT/deploy/database/participant/provision.sh" \
    --dry-run=client \
    --output=yaml >"$scripts_manifest"
apply_generated "$scripts_manifest"

kubectl --context "$KUBE_CONTEXT" \
    --namespace tx-infra \
    create configmap tx-database-provisioner-sql \
    --from-file="$ROOT/deploy/database/sql" \
    --dry-run=client \
    --output=yaml >"$sql_manifest"
apply_generated "$sql_manifest"

for job in \
    provision-operator-databases \
    provision-provider-databases \
    provision-consumer-databases; do
    kubectl --context "$KUBE_CONTEXT" --namespace tx-infra delete job "$job" --ignore-not-found
done

kubectl --context "$KUBE_CONTEXT" apply -f "$K8S_DIR/postgres/provision-jobs.yaml"

for job in \
    provision-operator-databases \
    provision-provider-databases \
    provision-consumer-databases; do
    if ! kubectl --context "$KUBE_CONTEXT" \
        --namespace tx-infra \
        wait --for=condition=complete "job/$job" --timeout=10m; then
        kubectl --context "$KUBE_CONTEXT" --namespace tx-infra logs "job/$job" --all-containers=true || true
        exit 1
    fi
done

echo "Local Kubernetes databases and roles are provisioned."
