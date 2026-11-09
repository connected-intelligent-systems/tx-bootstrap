#!/usr/bin/env bash
# End-to-end check of the operator tunnel: HTTPS ingress -> WireGuard ->
# participant sidecar -> public gateway, plus Headscale policy enforcement.
# Requires Docker with /dev/net/tun (Docker Desktop or Linux) and internet
# access for Tailscale's DERP map. Cleans up on exit unless KEEP=1.
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd -- "$here/../../.." && pwd)"
work="$(mktemp -d)"
chmod 700 "$work"
host=bpnl000000000001.tunnel.test

tunnel() {
  docker compose --env-file "$here/smoke.env" \
    -f "$repo/deploy/compose/tunnel.compose.yaml" \
    -f "$here/headscale.compose.yaml" "$@"
}
participant() {
  PARTICIPANT_PUBLIC_HOST="$host" HEADSCALE_URL=http://headscale:8080 \
    TAILNET_HOSTNAME=bpnl000000000001 TAILNET_AUTHKEY_FILE="$work/authkey" \
    docker compose --project-directory "$here" \
    -f "$here/smoke-participant.compose.yaml" \
    -f "$repo/deploy/compose/participant.tailnet.override.yaml" "$@"
}
cleanup() {
  if [ "${KEEP:-0}" != 1 ]; then
    participant down -v >/dev/null 2>&1 || true
    tunnel down -v >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT
request() {
  curl -sk --max-time 15 --resolve "$1:28443:127.0.0.1" \
    -o "$work/body" -w '%{http_code}' "https://$1:28443/"
}

tunnel up -d --wait --wait-timeout 180
tunnel exec -T headscale headscale preauthkeys create \
  --tags tag:txb-participant --expiration 15m --output json |
  sed -n 's/.*"key": *"\([^"]*\)".*/\1/p' | head -n 1 | tr -d '\n' >"$work/authkey"
test -s "$work/authkey"
participant up -d --wait --wait-timeout 180

for attempt in $(seq 1 20); do
  [ "$(request "$host")" = 200 ] && break
  sleep 3
done
grep -q "host=$host" "$work/body" || { echo "Participant not reachable through the tunnel" >&2; exit 1; }
[ "$(request bpnl000000000099.tunnel.test)" != 200 ] || { echo "Unknown participant was routed" >&2; exit 1; }

participant_ip="$(participant exec -T tailnet tailscale ip -4 | tr -d "\r")"
tunnel exec -T tunnel-node wget -q -T 5 -O /dev/null "http://$participant_ip:18080/"
if tunnel exec -T tunnel-node wget -q -T 5 -O /dev/null "http://$participant_ip:18081/" 2>/dev/null; then
  echo "Policy allowed a non-tunnel participant port" >&2
  exit 1
fi
echo "Tunnel smoke test passed"
