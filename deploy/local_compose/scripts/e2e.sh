#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LOCAL_DIR="${TX_BOOTSTRAP_LOCAL_DIR:-$ROOT/deploy/local_compose}"
ENV_FILE="${TX_BOOTSTRAP_ENV_FILE:-$LOCAL_DIR/local.env.example}"
RUNNER_IMAGE="${TX_BOOTSTRAP_RUNNER_IMAGE:-alpine:3.20}"

if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

PREFIX="${COMPOSE_PROJECT_PREFIX:-tx-bootstrap}"
PUBLIC_NETWORK="${TX_BOOTSTRAP_PUBLIC_NETWORK:-tx-bootstrap-public}"
CONTAINER="tx-bootstrap-e2e-$$"

cleanup() {
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network inspect "$PUBLIC_NETWORK" >/dev/null
docker network inspect "${PREFIX}-consumer-internal" >/dev/null
docker network inspect "${PREFIX}-provider-internal" >/dev/null

# Gives a running container a new address on a network, as recreating it would,
# while a placeholder holds the old one. The container keeps its aliases.
move_network_address() {
    local container="$1" network="$2" old_ip new_ip placeholder alias
    local -a alias_args=()

    old_ip="$(docker inspect --format "{{(index .NetworkSettings.Networks \"$network\").IPAddress}}" "$container")"
    for alias in $(docker inspect --format "{{range (index .NetworkSettings.Networks \"$network\").Aliases}}{{.}} {{end}}" "$container"); do
        alias_args+=(--alias "$alias")
    done
    docker network disconnect "$network" "$container"
    placeholder="$(docker run -d --rm --network "$network" --ip "$old_ip" --entrypoint sleep "$RUNNER_IMAGE" 120)"
    docker network connect ${alias_args[@]+"${alias_args[@]}"} "$network" "$container"
    docker stop --time 1 "$placeholder" >/dev/null
    new_ip="$(docker inspect --format "{{(index .NetworkSettings.Networks \"$network\").IPAddress}}" "$container")"
    if [ -z "$new_ip" ] || [ "$new_ip" = "$old_ip" ]; then
        echo "Could not move $container to a new address on $network" >&2
        return 1
    fi
    echo "  moved $container on $network from $old_ip to $new_ip"
}

# The gateways resolve their upstreams at runtime. Move the provider control
# plane without restarting its public gateway; the catalog request below
# reaches it only through the gateway's fresh lookup.
echo "=== Provider control plane at a new address ==="
move_network_address \
    "$(docker ps --quiet \
        --filter "label=com.docker.compose.project=${PREFIX}-provider" \
        --filter label=com.docker.compose.service=controlplane)" \
    "${PREFIX}-provider-internal"

# The gateway looks the control plane up again within a few seconds. Until then
# it still uses the old address, which the runner attached below can be given,
# and answers 502. Wait for the gateway to reach the control plane instead of
# letting the runner's single catalog request race the lookup.
printf "  waiting for the provider gateway to reach the moved control plane"
if ! docker run --rm --network "$PUBLIC_NETWORK" "$RUNNER_IMAGE" sh -c '
    for attempt in $(seq 1 30); do
        status="$(wget -S -q -T 3 -O /dev/null --header "Content-Type: application/json" --post-data "{}" \
            "http://${1}/api/v1/dsp/2025-1/catalog/request" 2>&1 |
            sed -n "s/^ *HTTP\/[0-9.]* \([0-9]*\).*/\1/p" | tail -n 1)"
        case "$status" in
            "" | 502 | 503 | 504) printf "."; sleep 1 ;;
            *) echo " OK (HTTP $status)"; exit 0 ;;
        esac
    done
    exit 1
' sh "${PROVIDER_DID_HOST:-provider-did}"; then
    echo " TIMEOUT" >&2
    echo "The provider gateway still cannot reach the moved control plane after 30 s." >&2
    exit 1
fi

docker create \
    --name "$CONTAINER" \
    --network "${PREFIX}-consumer-internal" \
    --env-file "$ENV_FILE" \
    -v "$LOCAL_DIR/scripts:/scripts:ro" \
    --entrypoint /bin/sh \
    "$RUNNER_IMAGE" \
    -c "apk add --no-cache bash coreutils curl jq >/dev/null && exec /bin/bash /scripts/e2e-runtime.sh" \
    >/dev/null

docker network connect "$PUBLIC_NETWORK" "$CONTAINER"
docker network connect "${PREFIX}-provider-internal" "$CONTAINER"
docker start -a "$CONTAINER"

RUNNER_EXIT_CODE="$(docker inspect --format '{{.State.ExitCode}}' "$CONTAINER")"
if [ "$RUNNER_EXIT_CODE" -ne 0 ]; then
    echo "E2E runner exited with status $RUNNER_EXIT_CODE" >&2
    exit "$RUNNER_EXIT_CODE"
fi
