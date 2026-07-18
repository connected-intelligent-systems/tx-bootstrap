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

compose consumer "${DOWN_ARGS[@]}"
compose provider "${DOWN_ARGS[@]}"
compose operator "${DOWN_ARGS[@]}"
compose infrastructure "${DOWN_ARGS[@]}"

if [ "${REMOVE_NETWORK:-0}" = "1" ]; then
    docker network rm "$PUBLIC_NETWORK" >/dev/null 2>&1 || true
fi
