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
    kubectl --context "$KUBE_CONTEXT" \
        --namespace "$namespace" \
        rollout status statefulset --all --timeout=10m
done

issuer_host="issuer.${LOCAL_K8S_INGRESS_IP}.nip.io"
onboarding_host="onboarding.${LOCAL_K8S_INGRESS_IP}.nip.io"
console_host="console.${LOCAL_K8S_INGRESS_IP}.nip.io"
provider_host="provider.${LOCAL_K8S_INGRESS_IP}.nip.io"
consumer_host="consumer.${LOCAL_K8S_INGRESS_IP}.nip.io"
provider_portal_host="provider-portal.${LOCAL_K8S_INGRESS_IP}.nip.io"
consumer_portal_host="consumer-portal.${LOCAL_K8S_INGRESS_IP}.nip.io"

wait_for_url() {
    local label="$1"
    local url="$2"
    local attempt

    printf "Waiting for %s" "$label"
    for attempt in $(seq 1 90); do
        if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
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

curl --fail --silent "http://${provider_host}/${BPN_PROVIDER}/did.json" | jq -e '.verificationMethod | length > 0' >/dev/null
curl --fail --silent "http://${consumer_host}/${BPN_CONSUMER}/did.json" | jq -e '.verificationMethod | length > 0' >/dev/null

echo
echo "Local Kubernetes smoke verification passed."
echo "  Operator console: http://${console_host}"
echo "  Provider portal:  http://${provider_portal_host}"
echo "  Consumer portal:  http://${consumer_portal_host}"
