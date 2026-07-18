#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
K8S_DIR="${TX_BOOTSTRAP_K8S_DIR:-$ROOT/deploy/local_k8s}"
ENV_FILE="${TX_BOOTSTRAP_K8S_ENV_FILE:-$K8S_DIR/local.env.example}"
GENERATED_DIR="$K8S_DIR/.generated"

if [ ! -f "$ENV_FILE" ]; then
    echo "Kubernetes environment file not found: $ENV_FILE" >&2
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${KUBE_CONTEXT:=rancher-desktop}"
: "${LOCAL_K8S_INGRESS_IP:=192.168.64.7}"
: "${CNPG_CHART_VERSION:=0.29.0}"
: "${VAULT_CHART_VERSION:=0.33.0}"
: "${POSTGRES_STORAGE_SIZE:=8Gi}"
: "${VAULT_STORAGE_SIZE:=2Gi}"

mkdir -p "$GENERATED_DIR"

require_command() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "Required command is missing: $1" >&2
        exit 1
    }
}

require_commands() {
    local command_name
    for command_name in "$@"; do
        require_command "$command_name"
    done
}

check_context() {
    local current_context
    current_context="$(kubectl config current-context)"
    if [ "$current_context" != "$KUBE_CONTEXT" ]; then
        echo "Refusing to modify Kubernetes context '$current_context'; expected '$KUBE_CONTEXT'." >&2
        exit 1
    fi
}

render_values() {
    local source_file="$1"
    local target_file="$2"

    sed \
        -e "s/__INGRESS_IP__/${LOCAL_K8S_INGRESS_IP}/g" \
        -e "s/__BPN_ISSUER__/${BPN_ISSUER}/g" \
        -e "s#__BPN_ISSUER_BASE64__#${BPN_ISSUER_BASE64}#g" \
        -e "s/__BPN_PROVIDER__/${BPN_PROVIDER}/g" \
        -e "s#__BPN_PROVIDER_BASE64__#${BPN_PROVIDER_BASE64}#g" \
        -e "s/__BPN_CONSUMER__/${BPN_CONSUMER}/g" \
        -e "s#__BPN_CONSUMER_BASE64__#${BPN_CONSUMER_BASE64}#g" \
        -e "s/__PROVIDER_CONTEXT_ID__/${PROVIDER_PARTICIPANT_CONTEXT_ID}/g" \
        -e "s/__CONSUMER_CONTEXT_ID__/${CONSUMER_PARTICIPANT_CONTEXT_ID}/g" \
        "$source_file" >"$target_file"
}

apply_generated() {
    local file="$1"
    kubectl --context "$KUBE_CONTEXT" apply -f "$file"
}

create_secret_manifest() {
    local namespace="$1"
    local name="$2"
    local target_file="$3"
    shift 3

    kubectl --context "$KUBE_CONTEXT" \
        --namespace "$namespace" \
        create secret generic "$name" \
        "$@" \
        --dry-run=client \
        --output=yaml >"$target_file"
    chmod 0600 "$target_file"
    apply_generated "$target_file"
}
