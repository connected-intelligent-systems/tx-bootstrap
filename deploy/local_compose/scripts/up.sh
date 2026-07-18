#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LOCAL_DIR="${TX_BOOTSTRAP_LOCAL_DIR:-$ROOT/deploy/local_compose}"
ENV_FILE="${TX_BOOTSTRAP_ENV_FILE:-$LOCAL_DIR/local.env.example}"

if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

PUBLIC_NETWORK="${TX_BOOTSTRAP_PUBLIC_NETWORK:-tx-bootstrap-public}"
OPERATOR_CONSOLE_DIR="$ROOT/apps/operator-console"
OPERATOR_ONBOARDING_SERVICE_DIR="$ROOT/apps/operator-onboarding-service"
PARTICIPANT_INIT_DIR="$ROOT/apps/participant-init"
PARTICIPANT_PORTAL_DIR="$ROOT/apps/participant-portal"
FEDERATED_CATALOG_DIR="$ROOT/apps/federated-catalog"
export OPERATOR_EDGE_NETWORK="${OPERATOR_EDGE_NETWORK:-$PUBLIC_NETWORK}"
export OPERATOR_COMPOSE_REF="${OPERATOR_COMPOSE_REF:-$ROOT/deploy/compose/operator.compose.yaml}"
export OPERATOR_CONSOLE_IMAGE="${OPERATOR_CONSOLE_IMAGE:-tx-bootstrap-operator-console:local}"
export OPERATOR_ONBOARDING_SERVICE_IMAGE="${OPERATOR_ONBOARDING_SERVICE_IMAGE:-tx-bootstrap-operator-onboarding-service:local}"
export PARTICIPANT_PUBLIC_NETWORK="${PARTICIPANT_PUBLIC_NETWORK:-$PUBLIC_NETWORK}"
export PARTICIPANT_INIT_IMAGE="${PARTICIPANT_INIT_IMAGE:-tx-bootstrap-participant-init:local}"
export PARTICIPANT_PORTAL_BACKEND_IMAGE="${PARTICIPANT_PORTAL_BACKEND_IMAGE:-tx-bootstrap-participant-portal-backend:local}"
export FEDERATED_CATALOG_IMAGE="${FEDERATED_CATALOG_IMAGE:-tx-bootstrap-federated-catalog:local}"

compose() {
    local domain="$1"
    local compose_file
    if [ "$domain" = "infrastructure" ]; then
        compose_file="$LOCAL_DIR/compose.yaml"
    else
        compose_file="$LOCAL_DIR/$domain/compose.yaml"
    fi
    local compose_args=(--env-file "$ENV_FILE" -f "$compose_file")
    shift

    docker compose "${compose_args[@]}" "$@"
}

build_local_images() {
    if [ "$OPERATOR_CONSOLE_IMAGE" = "tx-bootstrap-operator-console:local" ] && [ -d "$OPERATOR_CONSOLE_DIR" ]; then
        docker build -t "$OPERATOR_CONSOLE_IMAGE" -f "$OPERATOR_CONSOLE_DIR/Dockerfile" "$ROOT"
    fi

    if [ "$OPERATOR_ONBOARDING_SERVICE_IMAGE" = "tx-bootstrap-operator-onboarding-service:local" ] && [ -d "$OPERATOR_ONBOARDING_SERVICE_DIR" ]; then
        docker build -t "$OPERATOR_ONBOARDING_SERVICE_IMAGE" -f "$OPERATOR_ONBOARDING_SERVICE_DIR/Dockerfile" "$ROOT"
    fi

    if [ "$PARTICIPANT_INIT_IMAGE" = "tx-bootstrap-participant-init:local" ] && [ -d "$PARTICIPANT_INIT_DIR" ]; then
        docker build -t "$PARTICIPANT_INIT_IMAGE" -f "$PARTICIPANT_INIT_DIR/Dockerfile" "$PARTICIPANT_INIT_DIR"
    fi

    if [ "$PARTICIPANT_PORTAL_BACKEND_IMAGE" = "tx-bootstrap-participant-portal-backend:local" ] && [ -d "$PARTICIPANT_PORTAL_DIR" ]; then
        docker build -t "$PARTICIPANT_PORTAL_BACKEND_IMAGE" -f "$PARTICIPANT_PORTAL_DIR/Dockerfile" "$ROOT"
    fi

    if [ "$FEDERATED_CATALOG_IMAGE" = "tx-bootstrap-federated-catalog:local" ] && [ -d "$FEDERATED_CATALOG_DIR" ]; then
        docker build -t "$FEDERATED_CATALOG_IMAGE" -f "$FEDERATED_CATALOG_DIR/Dockerfile" "$FEDERATED_CATALOG_DIR"
    fi
}

connect_public_dns() {
    local domain="$1"
    shift
    local service container_id

    for service in "$@"; do
        container_id="$(compose "$domain" ps -q "$service")"
        if [ -n "$container_id" ]; then
            docker network connect "$PUBLIC_NETWORK" "$container_id" >/dev/null 2>&1 || true
        fi
    done
}

published_url() {
    local domain="$1"
    local service="$2"
    local target_port="$3"
    local path="${4:-}"
    local url_host="${5:-}"
    local published host port

    published="$(compose "$domain" port "$service" "$target_port" 2>/dev/null | head -n1 || true)"
    if [ -z "$published" ]; then
        printf "not published"
        return
    fi

    host="${published%:*}"
    port="${published##*:}"
    if [ -n "$url_host" ]; then
        host="$url_host"
    else
        case "$host" in
            0.0.0.0 | 127.0.0.1 | :: | "[::]")
                host="${LOCAL_URL_HOST:-127.0.0.1}"
                ;;
        esac
    fi

    printf "http://%s:%s%s" "$host" "$port" "$path"
}

print_local_urls() {
    local issuer_bpn="${BPN_ISSUER:-issuer}"
    local provider_bpn="${BPN_PROVIDER:-provider}"
    local consumer_bpn="${BPN_CONSUMER:-consumer}"

    echo
    echo "Local URLs:"
    echo "  Operator services:"
    printf "    Operator console:          %s\n" "$(published_url operator operator-console 3000)"
    printf "    Operator onboarding service: %s\n" "$(published_url operator operator-onboarding-service 3000)"
    printf "    BDRS management API:       %s\n" "$(published_url operator bdrs-server 8081 "/api/management")"
    printf "    Issuer IdentityHub:        %s\n" "$(published_url operator issuer-identityhub 8082)"
    printf "    Issuer DID document:       %s\n" "$(published_url operator issuer-did 80 "/${issuer_bpn}/did.json")"
    echo
    echo "  Provider participant:"
    printf "    Participant portal:        %s\n" "$(published_url provider portal-gateway 80)"
    printf "    Scoped participant API:    %s\n" "$(published_url provider participant-api-gateway 80)"
    printf "    Public gateway:            %s\n" "$(published_url provider public-gateway 80)"
    printf "    DSP endpoint:              %s\n" "$(published_url provider public-gateway 80 "/api/v1/dsp")"
    printf "    Credential endpoint:       %s\n" "$(published_url provider public-gateway 80 "/api/credentials")"
    printf "    DID document:              %s\n" "$(published_url provider public-gateway 80 "/${provider_bpn}/did.json")"
    echo
    echo "  Consumer participant:"
    printf "    Participant portal:        %s\n" "$(published_url consumer portal-gateway 80)"
    printf "    Scoped participant API:    %s\n" "$(published_url consumer participant-api-gateway 80)"
    printf "    Public gateway:            %s\n" "$(published_url consumer public-gateway 80)"
    printf "    DSP endpoint:              %s\n" "$(published_url consumer public-gateway 80 "/api/v1/dsp")"
    printf "    Credential endpoint:       %s\n" "$(published_url consumer public-gateway 80 "/api/credentials")"
    printf "    DID document:              %s\n" "$(published_url consumer public-gateway 80 "/${consumer_bpn}/did.json")"
    echo
    printf "  Local portal login: %s / %s\n" "${PORTAL_ADMIN_USERNAME:-admin}" "${PORTAL_ADMIN_PASSWORD:-local-admin-password}"
}

if ! docker network inspect "$PUBLIC_NETWORK" >/dev/null 2>&1; then
    docker network create "$PUBLIC_NETWORK" >/dev/null
fi

build_local_images

compose infrastructure up -d --remove-orphans --wait
compose operator up -d --remove-orphans
compose provider up -d --remove-orphans
connect_public_dns provider identityhub controlplane dataplane participant-portal-backend federated-catalog
compose consumer up -d --remove-orphans
connect_public_dns consumer identityhub controlplane dataplane participant-portal-backend federated-catalog

echo "tx-bootstrap local stack started."
echo "Public network: $PUBLIC_NETWORK"
print_local_urls
echo "Run deploy/local_compose/scripts/bootstrap.sh after services become healthy."
