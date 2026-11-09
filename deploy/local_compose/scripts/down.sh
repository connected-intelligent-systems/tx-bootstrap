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
DOWN_ARGS=(down --remove-orphans)

if [ "${1:-}" = "-v" ] || [ "${1:-}" = "--volumes" ]; then
    DOWN_ARGS+=(-v)
fi

# shellcheck source=compose-lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/compose-lib.sh"

compose consumer --profile tunnel "${DOWN_ARGS[@]}"
compose provider "${DOWN_ARGS[@]}"
compose operator "${DOWN_ARGS[@]}"
if tunnel_enabled || docker compose -p "${COMPOSE_PROJECT_PREFIX:-tx-bootstrap}-tunnel" ps -aq 2>/dev/null | grep -q .; then
    compose tunnel "${DOWN_ARGS[@]}"
fi
compose infrastructure "${DOWN_ARGS[@]}"

if [ "${REMOVE_NETWORK:-0}" = "1" ]; then
    docker network rm "$PUBLIC_NETWORK" >/dev/null 2>&1 || true
fi
