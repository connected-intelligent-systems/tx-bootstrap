#!/bin/bash
# Shared by up.sh, down.sh and bootstrap.sh. Expects LOCAL_DIR and ENV_FILE.
#
# TX_BOOTSTRAP_TUNNEL=1 runs the optional local operator tunnel (Headscale and
# an HTTP ingress) and publishes the consumer only through it. The provider
# keeps its direct endpoint, so the stack exercises both participant kinds.

TUNNEL_ENABLED="${TX_BOOTSTRAP_TUNNEL:-0}"
TUNNEL_HEADSCALE_URL="http://headscale.tunnel.test"
TUNNEL_DOMAIN="tunnel.test"
TUNNEL_CONSUMER_HOST="bpnl00000003azqp.tunnel.test"
TUNNEL_CONSUMER_AUTHKEY="$LOCAL_DIR/consumer/secrets/tailnet-authkey"

tunnel_enabled() {
    [ "$TUNNEL_ENABLED" = "1" ]
}

compose() {
    local domain="$1"
    shift
    local compose_file="$LOCAL_DIR/$domain/compose.yaml"
    local -a overrides=()

    case "$domain" in
        infrastructure)
            compose_file="$LOCAL_DIR/compose.yaml"
            ;;
        consumer)
            if tunnel_enabled; then
                compose_file="$LOCAL_DIR/consumer/tunnel.compose.yaml"
                # These keys also come from the sourced ENV_FILE, which would
                # otherwise take precedence over consumer/tunnel.env.
                overrides=(
                    "PARTICIPANT_PUBLIC_NETWORK=${COMPOSE_PROJECT_PREFIX:-tx-bootstrap}-consumer-edge"
                    "PARTICIPANT_PUBLIC_NETWORK_EXTERNAL=false"
                    "PARTICIPANT_PORTAL_PREVIEW_ALLOWED_PRIVATE_HOSTS=provider-did,$TUNNEL_CONSUMER_HOST"
                    "TAILNET_AUTHKEY_FILE=$TUNNEL_CONSUMER_AUTHKEY"
                )
            fi
            ;;
    esac

    env ${overrides[@]+"${overrides[@]}"} \
        docker compose --env-file "$ENV_FILE" -f "$compose_file" "$@"
}
