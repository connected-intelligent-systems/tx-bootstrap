#!/bin/bash
set -euo pipefail

# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_commands curl jq kubectl
check_context

for namespace in tx-operator tx-provider tx-consumer; do
    kubectl --context "$KUBE_CONTEXT" \
        --namespace "$namespace" \
        wait --for=condition=Available deployment --all --timeout=10m
done
for namespace in tx-provider tx-consumer; do
    while IFS= read -r statefulset; do
        [ -n "$statefulset" ] || continue
        kubectl --context "$KUBE_CONTEXT" \
            --namespace "$namespace" \
            rollout status "$statefulset" --timeout=10m
    done < <(
        kubectl --context "$KUBE_CONTEXT" \
            --namespace "$namespace" \
            get statefulset --output=name
    )
done

issuer_host="issuer.${LOCAL_K8S_INGRESS_IP}.nip.io"
onboarding_host="onboarding.${LOCAL_K8S_INGRESS_IP}.nip.io"
console_host="console.${LOCAL_K8S_INGRESS_IP}.nip.io"
provider_host="provider.${LOCAL_K8S_INGRESS_IP}.nip.io"
consumer_host="consumer.${LOCAL_K8S_INGRESS_IP}.nip.io"
provider_portal_host="provider-portal.${LOCAL_K8S_INGRESS_IP}.nip.io"
consumer_portal_host="consumer-portal.${LOCAL_K8S_INGRESS_IP}.nip.io"

curl_ingress() {
    local url="$1"
    local host="${url#http://}"
    local curl_args=(
        --fail
        --silent
        --show-error
        --connect-timeout 3
        --max-time 10
    )

    host="${host%%/*}"
    if [ -n "${LOCAL_K8S_INGRESS_CONNECT_IP:-}" ]; then
        curl_args+=(--resolve "${host}:80:${LOCAL_K8S_INGRESS_CONNECT_IP}")
    fi

    curl "${curl_args[@]}" "$url"
}

wait_for_url() {
    local label="$1"
    local url="$2"
    local attempt

    printf "Waiting for %s" "$label"
    for attempt in $(seq 1 90); do
        if curl_ingress "$url" >/dev/null 2>&1; then
            printf " OK\n"
            return 0
        fi
        printf "."
        sleep 2
    done
    printf " TIMEOUT\n" >&2
    return 1
}

wait_for_url "issuer DID" "http://${issuer_host}/${BPN_ISSUER}/did.json"
wait_for_url "operator onboarding" "http://${onboarding_host}/api/health"
wait_for_url "operator console" "http://${console_host}/api/health"
wait_for_url "provider DID" "http://${provider_host}/${BPN_PROVIDER}/did.json"
wait_for_url "consumer DID" "http://${consumer_host}/${BPN_CONSUMER}/did.json"
wait_for_url "provider portal" "http://${provider_portal_host}/health"
wait_for_url "consumer portal" "http://${consumer_portal_host}/health"
wait_for_url "provider participant OpenAPI" "http://${provider_portal_host}/api/openapi.json"
wait_for_url "consumer participant OpenAPI" "http://${consumer_portal_host}/api/openapi.json"
wait_for_url "provider federated catalog" "http://${provider_portal_host}/api/federated-catalog/v1/participants"
wait_for_url "consumer federated catalog" "http://${consumer_portal_host}/api/federated-catalog/v1/participants"

curl_ingress "http://${provider_host}/${BPN_PROVIDER}/did.json" | jq -e \
    --arg endpoint "http://${provider_host}/api/credentials/v1/participants/${BPN_PROVIDER_BASE64}" \
    '(.verificationMethod | length > 0) and any(.service[]; .type == "CredentialService" and .serviceEndpoint == $endpoint)' \
    >/dev/null
curl_ingress "http://${consumer_host}/${BPN_CONSUMER}/did.json" | jq -e \
    --arg endpoint "http://${consumer_host}/api/credentials/v1/participants/${BPN_CONSUMER_BASE64}" \
    '(.verificationMethod | length > 0) and any(.service[]; .type == "CredentialService" and .serviceEndpoint == $endpoint)' \
    >/dev/null
echo
echo "Local Kubernetes smoke verification passed."
echo "  Operator console: http://${console_host}"
echo "  Provider portal:  http://${provider_portal_host}"
echo "  Consumer portal:  http://${consumer_portal_host}"
