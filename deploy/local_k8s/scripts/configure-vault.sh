#!/bin/bash
set -euo pipefail

# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_commands jq kubectl openssl
check_context

vault_status() {
    kubectl --context "$KUBE_CONTEXT" \
        --namespace tx-infra \
        exec vault-0 -- \
        env VAULT_ADDR=http://127.0.0.1:8200 vault status -format=json 2>/dev/null || true
}

vault_root() {
    kubectl --context "$KUBE_CONTEXT" \
        --namespace tx-infra \
        exec -i vault-0 -- \
        env VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN="$root_token" vault "$@"
}

read_bootstrap_value() {
    local key="$1"
    kubectl --context "$KUBE_CONTEXT" \
        --namespace tx-infra \
        get secret vault-bootstrap \
        --output=json | jq -r --arg key "$key" '.data[$key]' | openssl base64 -d -A
}

kubectl --context "$KUBE_CONTEXT" \
    --namespace tx-infra \
    wait --for=jsonpath='{.status.phase}'=Running pod/vault-0 --timeout=10m

status_json="$(vault_status)"
if [ -z "$status_json" ]; then
    echo "Vault did not return status." >&2
    exit 1
fi

if [ "$(printf '%s' "$status_json" | jq -r '.initialized')" = "false" ]; then
    bootstrap_file="$GENERATED_DIR/vault-bootstrap.json"
    umask 077
    kubectl --context "$KUBE_CONTEXT" \
        --namespace tx-infra \
        exec vault-0 -- \
        env VAULT_ADDR=http://127.0.0.1:8200 \
        vault operator init -key-shares=1 -key-threshold=1 -format=json >"$bootstrap_file"

    unseal_key="$(jq -r '.unseal_keys_b64[0]' "$bootstrap_file")"
    root_token="$(jq -r '.root_token' "$bootstrap_file")"

    create_secret_manifest tx-infra vault-bootstrap \
        "$GENERATED_DIR/vault-bootstrap-secret.yaml" \
        --from-literal="unseal-key=$unseal_key" \
        --from-literal="root-token=$root_token"
else
    if ! kubectl --context "$KUBE_CONTEXT" --namespace tx-infra get secret vault-bootstrap >/dev/null 2>&1; then
        echo "Vault is initialized but the local vault-bootstrap Secret is missing." >&2
        exit 1
    fi
    unseal_key="$(read_bootstrap_value unseal-key)"
    root_token="$(read_bootstrap_value root-token)"
fi

status_json="$(vault_status)"
if [ "$(printf '%s' "$status_json" | jq -r '.sealed')" = "true" ]; then
    kubectl --context "$KUBE_CONTEXT" \
        --namespace tx-infra \
        exec vault-0 -- \
        env VAULT_ADDR=http://127.0.0.1:8200 \
        vault operator unseal "$unseal_key" >/dev/null
fi

for mount in operator provider consumer; do
    if ! vault_root secrets list -format=json | jq -e --arg path "${mount}/" 'has($path)' >/dev/null; then
        vault_root secrets enable -path="$mount" kv-v2 >/dev/null
    fi

    policy_file="$GENERATED_DIR/vault-${mount}.hcl"
    cat >"$policy_file" <<EOF
path "${mount}/data/*" {
  capabilities = ["create", "read", "update", "patch", "delete"]
}

path "${mount}/metadata/*" {
  capabilities = ["read", "list", "delete"]
}
EOF
    vault_root policy write "$mount" - <"$policy_file" >/dev/null
done

for entry in \
    "operator:$OPERATOR_VAULT_TOKEN" \
    "provider:$PROVIDER_VAULT_TOKEN" \
    "consumer:$CONSUMER_VAULT_TOKEN"; do
    policy="${entry%%:*}"
    token="${entry#*:}"
    vault_root token revoke "$token" >/dev/null 2>&1 || true
    vault_root token create \
        -id="$token" \
        -policy="$policy" \
        -no-default-policy \
        -orphan \
        -ttl=720h >/dev/null
done

seed_value() {
    local mount="$1"
    local alias="$2"
    local value="$3"
    vault_root kv put "$mount/$alias" content="$value" >/dev/null
}

ensure_aes_key() {
    local mount="$1"
    local alias="$2"
    if ! vault_root kv get -field=content "$mount/$alias" >/dev/null 2>&1; then
        seed_value "$mount" "$alias" "$(openssl rand -base64 32 | tr -d '\n')"
    fi
}

seed_value operator password password
seed_value operator super-user-apikey "$IDENTITYHUB_SUPERUSER_API_KEY"
seed_value operator mgmt-api-key "$BDRS_API_KEY"
seed_value operator edc.datasource.didentry.user bdrs
seed_value operator edc.datasource.didentry.password "$BDRS_DB_PASSWORD"
ensure_aes_key operator issuer-identityhub-encryption-key
ensure_aes_key operator issuer-service-encryption-key

for mount in provider consumer; do
    seed_value "$mount" password password
    seed_value "$mount" super-user-apikey "$IDENTITYHUB_SUPERUSER_API_KEY"
    ensure_aes_key "$mount" "${mount}-identityhub-encryption-key"
done

kubectl --context "$KUBE_CONTEXT" \
    --namespace tx-infra \
    wait --for=condition=Ready pod/vault-0 --timeout=5m

echo "Local Kubernetes Vault is initialized, unsealed, isolated, and seeded."
