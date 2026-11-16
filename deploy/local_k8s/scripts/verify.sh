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

# Participants reach each other and the issuer through the nip.io names, which
# point at LOCAL_K8S_INGRESS_IP. Host-side checks use the port forward instead,
# so they pass even when that address is wrong.
wait_in_cluster() {
    local label="$1" namespace="$2" url="$3" pod attempt current_ip

    printf "Waiting for %s" "$label"
    for attempt in $(seq 1 30); do
        pod="$(kubectl --context "$KUBE_CONTEXT" --namespace "$namespace" \
            get pod --selector app.kubernetes.io/component=portal \
            --field-selector status.phase=Running --output name 2>/dev/null | head -1)"
        if [ -n "$pod" ] && kubectl --context "$KUBE_CONTEXT" --namespace "$namespace" \
            exec "$pod" --container portal -- \
            node -e 'fetch(process.argv[1], { signal: AbortSignal.timeout(5000) }).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))' \
            "$url" >/dev/null 2>&1; then
            printf " OK\n"
            return 0
        fi
        printf "."
        sleep 2
    done
    printf " TIMEOUT\n" >&2
    current_ip="$(detect_ingress_ip)"
    if [ -n "$current_ip" ] && [ "$current_ip" != "$LOCAL_K8S_INGRESS_IP" ]; then
        echo "The deployment uses ingress address ${LOCAL_K8S_INGRESS_IP}, but Traefik now answers on ${current_ip}." >&2
        echo "Rancher Desktop changed its VM address. Reinstall with down.sh --volumes and up.sh, or add the old" >&2
        echo "address in the VM: rdctl shell sudo ip addr add ${LOCAL_K8S_INGRESS_IP}/32 dev vznat" >&2
    fi
    return 1
}

wait_in_cluster "provider DID from the consumer" tx-consumer "http://${provider_host}/${BPN_PROVIDER}/did.json"
wait_in_cluster "consumer DID from the provider" tx-provider "http://${consumer_host}/${BPN_CONSUMER}/did.json"
wait_in_cluster "issuer DID from the provider" tx-provider "http://${issuer_host}/${BPN_ISSUER}/did.json"

curl_ingress "http://${provider_host}/${BPN_PROVIDER}/did.json" | jq -e \
    --arg endpoint "http://${provider_host}/api/credentials/v1/participants/${BPN_PROVIDER}" \
    '(.verificationMethod | length > 0) and any(.service[]; .type == "CredentialService" and .serviceEndpoint == $endpoint)' \
    >/dev/null
curl_ingress "http://${consumer_host}/${BPN_CONSUMER}/did.json" | jq -e \
    --arg endpoint "http://${consumer_host}/api/credentials/v1/participants/${BPN_CONSUMER}" \
    '(.verificationMethod | length > 0) and any(.service[]; .type == "CredentialService" and .serviceEndpoint == $endpoint)' \
    >/dev/null
echo
echo "Local Kubernetes smoke verification passed."
echo "  Operator console: http://${console_host}"
echo "  Provider portal:  http://${provider_portal_host}"
echo "  Consumer portal:  http://${consumer_portal_host}"
