#!/usr/bin/env bash
# End-to-end check of the operator tunnel: TLS passthrough at the ingress ->
# WireGuard -> participant TLS endpoint (certificate from a local ACME server
# via TLS-ALPN-01 through the tunnel) -> public gateway, plus Headscale policy
# enforcement. Requires Docker with /dev/net/tun (Docker Desktop or Linux) and
# internet access for Tailscale's DERP map. Cleans up on exit unless KEEP=1.
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd -- "$here/../../.." && pwd)"
work="$(mktemp -d)"
chmod 700 "$work"
host=bpnl000000000001.tunnel.test
pebble_image=ghcr.io/letsencrypt/pebble:2.8.0@sha256:d9080f68f6cb6af8d82134ab26de0aaaf312ac9cba42aecc6d3aede6cb63007b

tunnel() {
  docker compose --env-file "$here/smoke.env" \
    -f "$repo/deploy/compose/tunnel.compose.yaml" \
    -f "$here/headscale.compose.yaml" \
    -f "$here/smoke.override.yml" "$@"
}
participant() {
  PARTICIPANT_PUBLIC_HOST="$host" HEADSCALE_URL=http://headscale:8080 \
    TAILNET_HOSTNAME=bpnl000000000001 TAILNET_AUTHKEY_FILE="$work/authkey" \
    TAILNET_FORWARD_HOST=smoke-participant-gateway \
    TAILNET_ACME_CA_SERVER=https://pebble:14000/dir \
    TAILNET_ACME_CA_CERTIFICATES=/certs/acme-ca.pem \
    SMOKE_ACME_CA_FILE="$work/acme-ca.pem" \
    TAILNET_RATE_LIMIT_AVERAGE=2 TAILNET_RATE_LIMIT_BURST=5 \
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
    -o "$work/body" -w '%{http_code}' "https://$1:28443/" || true
}
issuer() {
  openssl s_client -connect 127.0.0.1:28443 -servername "$1" </dev/null 2>/dev/null |
    openssl x509 -noout -issuer 2>/dev/null || true
}

# The participant's TLS endpoint trusts the local ACME server's API certificate.
ca_container="$(docker create "$pebble_image")"
docker cp "$ca_container:/test/certs/pebble.minica.pem" "$work/acme-ca.pem" >/dev/null
docker rm "$ca_container" >/dev/null
chmod 644 "$work/acme-ca.pem"

tunnel up -d --wait --wait-timeout 180
tunnel exec -T headscale headscale preauthkeys create \
  --tags tag:txb-participant --expiration 15m --output json |
  sed -n 's/.*"key": *"\([^"]*\)".*/\1/p' | head -n 1 | tr -d '\n' >"$work/authkey"
test -s "$work/authkey"
participant up -d --wait --wait-timeout 180

# TLS ends at the participant: the certificate clients see is the one the
# participant obtained through the tunnel, never one held by the ingress.
for attempt in $(seq 1 60); do
  issuer "$host" | grep -q Pebble && break
  sleep 3
done
issuer "$host" | grep -q Pebble || { echo "Participant certificate was not issued through the tunnel" >&2; exit 1; }
echo "Participant terminates TLS with its own certificate ($(issuer "$host"))"

for attempt in $(seq 1 10); do
  [ "$(request "$host")" = 200 ] && break
  sleep 3
done
grep -q "host=$host" "$work/body" || { echo "Participant not reachable through the tunnel" >&2; exit 1; }
[ "$(request bpnl000000000099.tunnel.test)" != 200 ] || { echo "Unknown participant was routed" >&2; exit 1; }

# Request limits now live at the participant (the ingress cannot see requests).
throttled="$(seq 1 30 | xargs -P 15 -I{} curl -sk --max-time 15 \
  --resolve "$host:28443:127.0.0.1" -o /dev/null -w '%{http_code}\n' \
  "https://$host:28443/" | grep -c '^429$' || true)"
[ "$throttled" -gt 0 ] || { echo "Rate limit did not apply" >&2; exit 1; }
echo "Rate limit applied ($throttled of 30 burst requests throttled)"

participant_ip="$(participant exec -T tailnet tailscale ip -4 | tr -d "\r")"
tunnel exec -T tunnel-node wget -q -T 5 -O /dev/null "http://$participant_ip:18080/"
if tunnel exec -T tunnel-node wget -q -T 5 -O /dev/null "http://$participant_ip:18081/" 2>/dev/null; then
  echo "Policy allowed a non-tunnel participant port" >&2
  exit 1
fi
echo "Tunnel smoke test passed"
