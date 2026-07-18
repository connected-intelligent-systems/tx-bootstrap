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
CONTAINER="tx-bootstrap-bootstrap-$$"

cleanup() {
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network inspect "$PUBLIC_NETWORK" >/dev/null

local_postgres="$(
    docker compose \
        --env-file "$ENV_FILE" \
        -f "$LOCAL_DIR/compose.yaml" \
        ps -q postgres
)"
[ -n "$local_postgres" ] || {
    echo "Local PostgreSQL is not running. Start the local deployment first." >&2
    exit 1
}
docker exec \
    -e "PGPASSWORD=${POSTGRES_PASSWORD:-password}" \
    "$local_postgres" \
    psql -U "${POSTGRES_USER:-user}" -d dataspace_admin -v ON_ERROR_STOP=1 \
    -c "DELETE FROM onboarding_cases WHERE bpn IN ('${BPN_PROVIDER}', '${BPN_CONSUMER}') OR requested_bpn IN ('${BPN_PROVIDER}', '${BPN_CONSUMER}') OR business_partner_id IN (SELECT id FROM business_partners WHERE assigned_bpn IN ('${BPN_PROVIDER}', '${BPN_CONSUMER}') OR requested_bpn IN ('${BPN_PROVIDER}', '${BPN_CONSUMER}')); DELETE FROM business_partners WHERE assigned_bpn IN ('${BPN_PROVIDER}', '${BPN_CONSUMER}') OR requested_bpn IN ('${BPN_PROVIDER}', '${BPN_CONSUMER}');" \
    >/dev/null 2>&1 || true

docker create \
    --name "$CONTAINER" \
    --network "$PUBLIC_NETWORK" \
    --env-file "$ENV_FILE" \
    -v "$LOCAL_DIR/scripts:/scripts:ro" \
    --entrypoint /bin/sh \
    "$RUNNER_IMAGE" \
    -c "apk add --no-cache bash coreutils curl jq >/dev/null && exec /bin/bash /scripts/bootstrap-runtime.sh" \
    >/dev/null

for network in \
    "${PREFIX}-operator-internal" \
    "${PREFIX}-provider-internal" \
    "${PREFIX}-consumer-internal"; do
    docker network inspect "$network" >/dev/null
    docker network connect "$network" "$CONTAINER"
done

docker start -a "$CONTAINER"

RUNNER_EXIT_CODE="$(docker inspect --format '{{.State.ExitCode}}' "$CONTAINER")"
if [ "$RUNNER_EXIT_CODE" -ne 0 ]; then
    echo "Bootstrap runner exited with status $RUNNER_EXIT_CODE" >&2
    exit "$RUNNER_EXIT_CODE"
fi
