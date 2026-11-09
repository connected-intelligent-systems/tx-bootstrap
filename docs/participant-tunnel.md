# Participant tunnel

A participant publishes its DID, DSP, credential and data-plane endpoints over
public HTTPS. The usual way is the participant's own TLS reverse proxy in front
of the `public-gateway` service. The **tunnel** is an optional alternative
for participants that can't accept inbound connections. A shared ingress
terminates TLS for them and forwards over a Headscale/Tailscale tunnel.

```text
other participants ──HTTPS──▶ tunnel ingress (wildcard TLS for *.<zone>)
                                   │ tailnet, TCP 18080
                                   ▼
             participant: tailnet sidecar ──▶ public-gateway:80
participant outbound (DIDs, DSP, issuer) ──▶ public internet
```

The tunnel carries inbound traffic only. The participant's DID is
`did:web:<bpn>.<zone>:<BPN>` and resolves publicly, just like a self-hosted one.
Tunnelled and self-hosted participants interoperate, and a participant can
switch between the two by repointing DNS without changing its DID.

## Participant

The operator sends tunnel settings, either with the participant's invitation
or later from the participant's **Tunnel** tab in the operator console. They
don't depend on how the participant is deployed:

```dotenv
HEADSCALE_URL=https://headscale.example.org
TAILNET_HOSTNAME=bpnl000000000001
PARTICIPANT_PUBLIC_HOST=bpnl000000000001.tunnel.example.org
PARTICIPANT_DID_HOST=bpnl000000000001.tunnel.example.org
TAILNET_AUTHKEY=<single-use key>
```

`TAILNET_AUTHKEY` is a secret. A key sent with the invitation is valid for 7
days by default, a key issued later from the Tunnel tab for 15 minutes. It is
needed only for the first start; the node identity then persists in the
sidecar's state volume, so keep that volume across restarts and upgrades.

With Docker Compose, add the other values to the participant environment,
store the key in `secrets/tailnet-authkey` with mode 600 (or point
`TAILNET_AUTHKEY_FILE` at the key file), and start the
`tx-bootstrap-participant-tunnel` artifact instead of
`tx-bootstrap-participant`. It is the participant application with
[`participant.tailnet.override.yaml`](../deploy/compose/participant.tailnet.override.yaml)
applied:

```sh
docker compose -f oci://ghcr.io/<owner>/tx-bootstrap-participant-tunnel:<version> \
  up -d --wait
```

With the participant Helm chart, set `tunnel.enabled` and map the values as
described in the chart's
[Operator tunnel](../deploy/helm/participant/README.md#operator-tunnel) section.

The sidecar uses userspace networking: it needs no capabilities, no `/dev/net/tun`
and no host VPN, and it only forwards tailnet TCP 18080 to the public gateway.
Management APIs, portal, Vault and databases stay unreachable as before.

When the participant later moves to its own public HTTPS endpoint, point DNS
for the public host at the new proxy, remove the override, and ask the operator
to revoke the enrollment.

## Operator

Each operator deployment runs its own tunnel ingress with its own domain and
wildcard certificate. That is the one-time cost that saves every tunnelled
participant from running a public endpoint. The tunnel needs two parts:

- **A Headscale server**, run by the operator like PostgreSQL and Vault.
  tx-bootstrap does not deploy it; any Headscale 0.29.x that meets the
  [requirements](#headscale-requirements) works.
- **The tunnel ingress**, deployed next to the operator application from
  [`deploy/compose/tunnel.compose.yaml`](../deploy/compose/tunnel.compose.yaml):

| Service         | Role                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `tunnel-node`   | The ingress's WireGuard peer in the operator's Headscale, `tag:txb-ingress`                     |
| `tunnel-router` | nginx in the peer's network namespace; maps `<name>.<zone>` to `<name>.<MagicDNS domain>:18080` |
| `traefik`       | Public ports 80/443; wildcard certificate for `*.<zone>` through ACME DNS-01                    |

### Headscale requirements

- An HTTPS URL that participants, the ingress and the operator console can
  reach, with a DERP relay (Headscale's embedded relay or another one) for
  participants whose network blocks direct WireGuard.
- MagicDNS enabled. Its `dns.base_domain` is the ingress's
  `TUNNEL_MAGICDNS_DOMAIN` (default `tailnet.internal`).
- A policy in which only the ingress reaches participants, and only on their
  tunnel port. Participants get no grants: they can't reach each other, the
  ingress, or any other port.

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
        "ip": ["tcp:18080"]
      }
    ]
  }
  ```

- An API key for the operator console (`headscale apikeys create`).
- A pre-auth key for the ingress node:
  `headscale preauthkeys create --tags tag:txb-ingress --expiration 1h`.

[`deploy/local_compose/tunnel/headscale.compose.yaml`](../deploy/local_compose/tunnel/headscale.compose.yaml)
is the throwaway Headscale used by the local stack and CI, and a working
example of the configuration.

### Ingress prerequisites

- A public IPv4 address with TCP 80/443 and UDP 41641 open. UDP 41641 lets
  participants reach the ingress node with direct WireGuard. Set
  `TUNNEL_PUBLIC_ENDPOINT` to `<public IPv4>:41641`: behind Docker's NAT the
  node can't discover that address itself. Without it, traffic between the
  ingress and participants goes through the Headscale's DERP relay.
- A DNS zone (for example `tunnel.example.org`) with `A` records for the zone
  apex and `*.<zone>` pointing at that address.
- API credentials for the zone's DNS provider. Traefik supports the providers
  listed in its ACME DNS-01 documentation. Put the provider's variables (for
  example `HETZNER_API_TOKEN`) as `KEY=value` lines in the file named by
  `TUNNEL_ACME_ENV_FILE`. Traefik reads it as a Compose secret, so it is never
  part of the compose application.

### Deploy

The ingress is published as the `tx-bootstrap-tunnel` Compose artifact. On
the public server, for example in `/opt/txb-tunnel`:

```sh
install -d -m 700 /opt/txb-tunnel/secrets
cp deploy/compose/tunnel.env.example /opt/txb-tunnel/.env   # then edit
printf 'HETZNER_API_TOKEN=%s\n' "$TOKEN" > /opt/txb-tunnel/secrets/acme.env
# tag:txb-ingress key from your Headscale; only used for the first start
printf '%s' "$INGRESS_KEY" > /opt/txb-tunnel/secrets/ingress-authkey
chmod 600 /opt/txb-tunnel/.env /opt/txb-tunnel/secrets/*
cd /opt/txb-tunnel
docker compose -f oci://ghcr.io/<owner>/tx-bootstrap-tunnel:<version> up -d --wait
```

Traefik obtains the wildcard certificate within about a minute of the first
start and renews it automatically.

The ingress limits each participant so that one participant, or traffic aimed
at one, can't exhaust the shared ingress. Requests over a limit get `429`:

| Setting                                     | Default | Limit                                    |
| ------------------------------------------- | ------- | ---------------------------------------- |
| `TUNNEL_RATE_LIMIT_AVERAGE` / `_BURST`      | 100/200 | Requests per second per participant host |
| `TUNNEL_MAX_CONCURRENT_REQUESTS`            | 64      | Concurrent requests per participant host |
| `TUNNEL_MAX_CONCURRENT_REQUESTS_PER_CLIENT` | 16      | Concurrent requests per client address   |

Timeouts stay unlimited so large data transfers work; the per-client limit
bounds how many slow connections one address can hold open.

Traefik loads every file in `/etc/traefik/dynamic`. To publish more routes
through the same Traefik, for example a Headscale on the same server, mount an
extra file there (`/etc/traefik/dynamic/headscale.yaml`) with its own router
and service; the participant routes stay as shipped. The ingress node's identity is kept in the
`tunnel-node-state` volume; to re-enroll it, remove that volume and provide a
new key.

Configure the console with your Headscale and its API key:

```dotenv
HEADSCALE_ENABLED=true
HEADSCALE_URL=https://headscale.example.org
HEADSCALE_API_KEY=<from your secret manager>
HEADSCALE_PARTICIPANT_DOMAIN=tunnel.example.org
```

The console then issues participant keys, tracks nodes, and renames each node
to its participant's lowercase BPN. In the console, tick **Publish through the
operator tunnel** when creating a participant to include a key in the
invitation (`HEADSCALE_INVITATION_TTL_SECONDS`, 7 days by default). The
participant's **Tunnel** tab shows the connection state (waiting, online,
routable, expired), issues a replacement key and revokes the enrollment. Each
key is shown once; the console does not store it. A participant has at most
one active enrollment, so revoke an expired one before issuing a new key. The
console never connects to the ingress host. Rotate the API key before it
expires with `headscale apikeys create` and
`headscale apikeys expire --prefix <prefix>`.

The operator's own issuer and onboarding endpoints must still be publicly
reachable, because participants resolve them over the internet. They are
published through the operator deployment's own ingress (the Helm chart's
Ingress or any reverse proxy), not through the tunnel. The tunnel ingress
serves participants only, so its configuration and failure domain stay
separate from the operator's, and the console and management APIs never sit
behind it. To run both on one server, give the operator its own host names
outside the tunnel zone and its own proxy or certificate.

### Routing and names

Routing depends only on Headscale node names, so new participants need no
ingress change. The console's reconciliation keeps those names authoritative:
a node can only hold a participant's name if it joined with that participant's
key. A squatter is renamed within one reconciliation interval (15 seconds),
and only an enrolled, tagged participant could attempt it. Unknown names return
`502`.

### Local tunnel mode

The local Compose stack can run the whole flow on one machine, without public
DNS, certificates or a server:

```sh
TX_BOOTSTRAP_TUNNEL=1 deploy/local_compose/scripts/up.sh
TX_BOOTSTRAP_TUNNEL=1 deploy/local_compose/scripts/bootstrap.sh
deploy/local_compose/scripts/e2e.sh
TX_BOOTSTRAP_TUNNEL=1 deploy/local_compose/scripts/down.sh
```

Without `TX_BOOTSTRAP_TUNNEL=1` the local stack is unchanged and Headscale is
not started. The consumer's DID differs between the two modes and an existing
wallet keeps its old DID, so switch modes with `down.sh -v` first. In tunnel mode:

- `deploy/local_compose/tunnel/` runs the same `tunnel.compose.yaml` with a
  throwaway Headscale and a local layer: Headscale and the ingress serve plain HTTP (the local stack
  uses `did:web` over HTTP), ACME is off, and the ingress joins the shared
  `tx-bootstrap-public` network that stands in for the internet under the
  names `headscale.tunnel.test` and `bpnl00000003azqp.tunnel.test`.
- The **provider** keeps its direct endpoint. The **consumer** has none: its
  public gateway sits on a private edge network and is reachable only as
  `http://bpnl00000003azqp.tunnel.test` through the tunnel
  (`deploy/local_compose/consumer/tunnel.compose.yaml`).
- The operator console is configured for the local Headscale. Because it is
  plain HTTP, this needs `HEADSCALE_ALLOW_INSECURE_HTTP=true`, which only the
  local mode sets.
- `bootstrap.sh` creates the consumer, enrolls it through the console API,
  starts its sidecar with the returned key, waits until the console has
  renamed the node and its DID resolves through the tunnel, and then
  continues onboarding. The e2e run then negotiates and transfers between the
  direct provider and the tunnelled consumer.

TLS and Let's Encrypt are not exercised locally; the smoke test below covers
the HTTPS ingress, and a deployed tunnel covers real certificates.

### Smoke test

[`deploy/local_compose/tunnel/smoke.sh`](../deploy/local_compose/tunnel/smoke.sh)
runs the tunnel ingress with the throwaway Headscale locally, without public
DNS. It enrolls a stand-in participant
through the real sidecar override, requests it through the HTTPS ingress, and
checks that the policy blocks other participant ports. It needs Docker with
`/dev/net/tun` and outbound internet access for Tailscale's public DERP map.
