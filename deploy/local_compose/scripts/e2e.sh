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
