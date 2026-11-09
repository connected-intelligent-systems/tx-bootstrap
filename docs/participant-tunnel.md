# Participant tunnel

Use the optional operator tunnel when a participant cannot accept inbound
internet connections. A shared ingress forwards public HTTPS traffic through
Headscale/Tailscale to the participant, which terminates TLS with its own
certificate. Outbound dataspace traffic uses the internet as usual.

```text
Public HTTPS → operator tunnel ingress → participant tunnel node
             → participant TLS endpoint → public gateway
```

The participant keeps a publicly resolvable DID and works with directly hosted
participants. Moving to another ingress can preserve the DID if the public
hostname stays the same.

## Participant

The operator provides a single-use enrollment key and these settings, either
with the invitation or from the console's **Tunnel** tab:

```dotenv
HEADSCALE_URL=https://headscale.example.org
TAILNET_HOSTNAME=bpnl000000000001
PARTICIPANT_PUBLIC_HOST=bpnl000000000001.tunnel.example.org
PARTICIPANT_DID_HOST=bpnl000000000001.tunnel.example.org
```

Invitation keys expire after 7 days by default; keys issued for immediate
deployment expire after 15 minutes. An expired key does not disconnect an
already enrolled node.

For Compose, add the settings to your participant environment file. Store the
key in `secrets/tailnet-authkey` with file mode 600, or set
`TAILNET_AUTHKEY_FILE` to its path. Use the tunnel-enabled participant package,
replacing `VERSION` with a published version:

```sh
docker compose --env-file /path/to/participant.env \
  -f oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-participant-tunnel:VERSION \
  up -d --wait
```

The default key path is relative to the Compose project directory. The
[override manifest](../deploy/compose/participant.tailnet.override.yaml)
provides the full settings reference. For Kubernetes, use the
[participant chart's tunnel settings](../deploy/helm/participant/README.md#operator-tunnel).

For Compose, keep the `tailnet-state` and `tailnet-tls-acme` volumes across
restarts and upgrades: they store the node identity and certificate. A lost node identity
requires a new enrollment key. Certificates are obtained and renewed through
the tunnel using ACME; set `TAILNET_ACME_EMAIL` for the contact address or
`TAILNET_ACME_CA_SERVER` for another certificate authority.

The portal, management APIs, Vault, and PostgreSQL remain private.

## Operator

The tunnel needs an externally managed Headscale server, a public ingress
host, and the console's authenticated routing endpoint. The operator console's
integration targets Headscale 0.29.7.

### Headscale requirements

- An HTTPS endpoint reachable by the console, ingress, and participants.
- Relay connectivity for participants that cannot connect directly.
- Participant IPv4 addresses within Headscale's `100.64.0.0/10` range.
- An API key for the console and a tagged ingress enrollment key.
- A policy that permits only ingress-to-participant traffic on TCP 18443.

For the default tags, the policy is:

```json
{
  "tagOwners": {
    "tag:txb-ingress": [],
    "tag:txb-participant": []
  },
  "grants": [
    {
      "src": ["tag:txb-ingress"],
      "dst": ["tag:txb-participant"],
      "ip": ["tcp:18443"]
    }
  ]
}
```

The [local Headscale configuration](../deploy/local_compose/tunnel/headscale.compose.yaml)
is a working example; it also permits the HTTP-only port used by local tests.

### Deploy

Prepare a public host with TCP 80/443 and UDP 41641 reachable. Point the tunnel
zone and its wildcard DNS record at the host. Set `TUNNEL_PUBLIC_ENDPOINT` to
its public IPv4 address and UDP port so peers can connect directly.

Copy [tunnel.env.example](../deploy/compose/tunnel.env.example) to `.env` in a
deployment directory and set the Headscale URL, tunnel domain,
and public endpoint. Store the ingress enrollment key at
`secrets/ingress-authkey` with file mode 600. From that directory, run:

```sh
docker compose \
  -f oci://ghcr.io/connected-intelligent-systems/tx-bootstrap-tunnel:VERSION \
  up -d --wait
```

Replace `VERSION` with a published version. Keep the `tunnel-node-state`
volume to preserve the ingress's enrollment. The
[ingress manifest](../deploy/compose/tunnel.compose.yaml) lists all settings.

Configure the operator console:

```dotenv
HEADSCALE_ENABLED=true
HEADSCALE_URL=https://headscale.example.org
HEADSCALE_PARTICIPANT_DOMAIN=tunnel.example.org
```

Inject `HEADSCALE_API_KEY` from your secret manager into the console backend.
Generate a separate random token of at least 32 characters. Set it as
`HEADSCALE_ROUTING_API_KEY` on the console and `TUNNEL_ROUTING_API_KEY` on the
ingress. The console also accepts `HEADSCALE_ROUTING_API_KEY_FILE`. Set
`TUNNEL_ROUTING_API_URL` to
`https://<console-host>/api/network/tunnel-routes`. This token only reads
approved routes; never reuse an administrative API key.

The ingress refreshes routes every five seconds. Routes bind public hostnames
to the addresses of nodes matched to verified enrollment keys; client-selected
MagicDNS names cannot publish endpoints. Missing, ambiguous, expired, or
revoked enrollments have no route. If the routing endpoint is unavailable or
returns invalid configuration, the ingress blocks new connections until a
valid response arrives. Existing TCP connections may finish during a router
reload. Keep the console routing endpoint reachable independently of the
participant tunnel. Plain HTTP requires `TUNNEL_ROUTING_ALLOW_INSECURE_HTTP=true`
and is only intended for isolated local tests.

When upgrading an existing ingress, configure these routing settings before
starting the new deployment. An ingress without a routing token cannot start.
For Kubernetes, use the [operator chart settings](../deploy/helm/operator/README.md#optional-tunnel-enrollment).
Keep the operator's issuer and onboarding endpoints publicly reachable through
its own HTTPS ingress.

### Manage access

Select **Publish through the operator tunnel** when creating a participant to
include a key in the invitation. Use the participant's **Tunnel** tab to check
connection state, issue a replacement key, or revoke access. The participant
needs a verified BPN before enrollment.

Keys are shown only once. If a key is lost or expires before use, revoke the
enrollment and issue a new one. Rejecting or
[revoking](operator.md#revoke-a-participant) a participant also triggers
tunnel revocation. Offline nodes are flagged as stale after 7 days by default; they
are not automatically deleted just for being offline.

If console startup or key creation is interrupted, reconciliation releases an
abandoned `CREATING` reservation after at least one minute. It skips rows locked
by an active creation and records an audit event. Issue a replacement using a
new deployment ID; reconciliation never mints or retrieves a key. An unknown
remote key may remain until its original expiry, but it has no approved route.

### Trust and certificates

Public traffic stays encrypted through the ingress until it reaches the
participant. The operator can observe connection metadata, block traffic, and
control DNS for its tunnel zone. TLS passthrough does not remove that DNS
trust relationship.

Participants obtain individual certificates, so their certificate authority's
issuance limits apply across the shared domain. Account for those limits when
onboarding many participants.

## Local tunnel mode

The local demo can tunnel the consumer while the provider keeps its direct
endpoint. Switching modes changes the consumer's DID: reset the demo first.
**The reset deletes local demo data.**

```sh
deploy/local_compose/scripts/down.sh --volumes
TX_BOOTSTRAP_TUNNEL=1 deploy/local_compose/scripts/up.sh
TX_BOOTSTRAP_TUNNEL=1 deploy/local_compose/scripts/bootstrap.sh
deploy/local_compose/scripts/e2e.sh
TX_BOOTSTRAP_TUNNEL=1 deploy/local_compose/scripts/down.sh
```

Local mode uses HTTP and a throwaway Headscale without public DNS or real
certificates. To test TLS passthrough and certificate issuance with a local
ACME server, run:

```sh
deploy/local_compose/tunnel/smoke.sh
```

The smoke test requires Docker with `/dev/net/tun` and outbound internet
access. A public deployment still needs verification with its actual DNS,
certificate authority, and network configuration.
