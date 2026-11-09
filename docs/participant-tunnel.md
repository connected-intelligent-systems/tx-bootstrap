# Participant tunnel

A participant publishes its DID, DSP, credential and data-plane endpoints over
public HTTPS. The usual way is the participant's own TLS reverse proxy in front
of the `public-gateway` service. The **tunnel** is an optional alternative
for participants that can't accept inbound connections. A shared ingress
passes their connections, still encrypted, over a Headscale/Tailscale tunnel to
the participant, which terminates TLS itself.

```text
other participants ──HTTPS──▶ tunnel ingress (TLS passthrough, routes by server name)
                                   │ tailnet, TCP 18443, still encrypted
                                   ▼
             participant: tailnet sidecar ──▶ tailnet-tls (own certificate) ──▶ public-gateway:80
participant outbound (DIDs, DSP, issuer) ──▶ public internet
```

The tunnel carries inbound traffic only. The participant's DID is
`did:web:<bpn>.<zone>:<BPN>` and resolves publicly, just like a self-hosted one.
Tunnelled and self-hosted participants interoperate, and a participant can
switch between the two by repointing DNS without changing its DID.

## Security model

The ingress reads only the server name from the TLS handshake and forwards the
encrypted connection unopened. It holds no certificate or key for participant
names, so the operator cannot read DSP messages, tokens, credentials, DID
documents or data, and a compromised ingress cannot either.

What the operator can still do:

- **See metadata:** which participant is contacted, when, from where, and how
  much traffic flows. The server name is unencrypted by design.
- **Block or delay** a participant's traffic.
- **Intercept deliberately**, because it controls the `<zone>` DNS zone and
  could obtain its own certificate for a participant's name. Every public
  certificate is logged in Certificate Transparency, so this is detectable:
  participants can watch their name in a CT monitor (for example crt.sh or
  Cert Spotter) for certificates they did not request. Participants using their
  own domain instead of the operator's zone close this gap.

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

The override adds two sidecars:

- `tailnet`, the Tailscale node, in userspace networking: no capabilities, no
  `/dev/net/tun`, no host VPN. It only forwards tailnet TCP 18443 to
  `tailnet-tls` (and 18080, plain HTTP for setups without TLS, to the public
  gateway).
- `tailnet-tls`, a Traefik that terminates TLS for `PARTICIPANT_PUBLIC_HOST`
  with the participant's own certificate and forwards to the public gateway.
  It obtains and renews the certificate from Let's Encrypt with the
  TLS-ALPN-01 challenge through the tunnel itself: no DNS credentials and no
  further ports. The certificate is kept in the `tailnet-tls-acme` volume.

Optional settings for `tailnet-tls`:

| Setting                                 | Default       | Meaning                                                  |
| --------------------------------------- | ------------- | -------------------------------------------------------- |
| `TAILNET_ACME_EMAIL`                    | empty         | Contact address for the ACME account                     |
| `TAILNET_ACME_CA_SERVER`                | Let's Encrypt | ACME directory URL                                       |
| `TAILNET_RATE_LIMIT_AVERAGE` / `_BURST` | 100/200       | Requests per second for all public traffic (`429` above) |
| `TAILNET_MAX_CONCURRENT_REQUESTS`       | 64            | Concurrent public requests                               |

Management APIs, portal, Vault and databases stay unreachable as before.

When the participant later moves to its own public HTTPS endpoint, point DNS
for the public host at the new proxy, remove the override, and ask the operator
to revoke the enrollment.

## Operator

Each operator deployment runs its own tunnel ingress with its own domain. That
is the one-time cost that saves every tunnelled participant from running a
public endpoint. The tunnel needs two parts:

- **A Headscale server**, run by the operator like PostgreSQL and Vault.
  tx-bootstrap does not deploy it; any Headscale 0.29.x that meets the
  [requirements](#headscale-requirements) works.
- **The tunnel ingress**, deployed next to the operator application from
  [`deploy/compose/tunnel.compose.yaml`](../deploy/compose/tunnel.compose.yaml):

| Service         | Role                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `tunnel-node`   | The ingress's WireGuard peer in the operator's Headscale, `tag:txb-ingress`                                                               |
| `tunnel-router` | nginx stream in the peer's network namespace; maps the server name `<name>.<zone>` to `<name>.<MagicDNS domain>:18443` without decrypting |
| `traefik`       | Public ports 80 (redirect) and 443; TLS passthrough by server name; no certificates                                                       |

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
        "ip": ["tcp:18443"]
      }
    ]
  }
  ```

- An API key for the operator console (`headscale apikeys create`).
- A pre-auth key for the ingress node:
  `headscale preauthkeys create --tags tag:txb-ingress --expiration 1h`.

[`deploy/local_compose/tunnel/headscale.compose.yaml`](../deploy/local_compose/tunnel/headscale.compose.yaml)
is the throwaway Headscale used by the local stack and CI, and a working
example of the configuration. Its policy also grants TCP 18080, the plain-HTTP
path the local stack uses.

### Ingress prerequisites

- A public IPv4 address with TCP 80/443 and UDP 41641 open. UDP 41641 lets
  participants reach the ingress node with direct WireGuard. Set
  `TUNNEL_PUBLIC_ENDPOINT` to `<public IPv4>:41641`: behind Docker's NAT the
  node can't discover that address itself. Without it, traffic between the
  ingress and participants goes through the Headscale's DERP relay.
- A DNS zone (for example `tunnel.example.org`) with `A` records for the zone
  apex and `*.<zone>` pointing at that address. No DNS API credentials are
  needed: participants obtain their certificates themselves.

Let's Encrypt issues at most 50 new certificates per week for one registered
domain (renewals excluded), and all participants under `<zone>` share that
budget. When onboarding more participants than that per week, request a higher
limit or point `TAILNET_ACME_CA_SERVER` at another ACME CA.

### Deploy

The ingress is published as the `tx-bootstrap-tunnel` Compose artifact. On
the public server, for example in `/opt/txb-tunnel`:

```sh
install -d -m 700 /opt/txb-tunnel/secrets
cp deploy/compose/tunnel.env.example /opt/txb-tunnel/.env   # then edit
# tag:txb-ingress key from your Headscale; only used for the first start
printf '%s' "$INGRESS_KEY" > /opt/txb-tunnel/secrets/ingress-authkey
chmod 600 /opt/txb-tunnel/.env /opt/txb-tunnel/secrets/*
cd /opt/txb-tunnel
docker compose -f oci://ghcr.io/<owner>/tx-bootstrap-tunnel:<version> up -d --wait
```

The ingress node's identity is kept in the `tunnel-node-state` volume; to
re-enroll it, remove that volume and provide a new key.

Because the ingress can't see requests, request limits live at each
participant (`TAILNET_RATE_LIMIT_*` above). The ingress caps connections per
client address so that slow clients can't hold the shared ingress open:

| Setting                             | Default | Limit                                     |
| ----------------------------------- | ------- | ----------------------------------------- |
| `TUNNEL_MAX_CONNECTIONS_PER_CLIENT` | 16      | Concurrent connections per client address |

Traefik loads every file in `/etc/traefik/dynamic`. To publish more services
through the same Traefik, for example a Headscale on the same server, mount an
extra file there (`/etc/traefik/dynamic/headscale.yaml`) with its own router
and a higher priority than the participant router (`10`); the participant
routes stay as shipped. Such a service can terminate TLS itself behind a
passthrough router, or use a certificate resolver you add to Traefik.

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
stale, routable, expired), issues a replacement key and revokes the
enrollment. Each key is shown once; the console does not store it. A
participant has at most one active enrollment, so revoke an expired one before
issuing a new key. The console never connects to the ingress host. Rotate the
API key before it expires with `headscale apikeys create` and
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
and only an enrolled, tagged participant could attempt it. Even then it could
not complete a TLS handshake for the name without the participant's
certificate. Connections for unknown names are closed.

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
  throwaway Headscale and a local layer. The local stack uses `did:web` over
  plain HTTP, so Headscale and the ingress serve HTTP, the ingress routes by
  the `Host` header to the participants' plain-HTTP port 18080, and the
  consumer runs without `tailnet-tls`. The ingress joins the shared
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

TLS is not exercised in the local stack; the smoke test below covers TLS
passthrough and certificate issuance, and a deployed tunnel covers Let's
Encrypt.

### Smoke test

[`deploy/local_compose/tunnel/smoke.sh`](../deploy/local_compose/tunnel/smoke.sh)
runs the tunnel ingress with the throwaway Headscale and a local ACME server
(Pebble) in place of Let's Encrypt, without public DNS. It enrolls a stand-in
participant through the real sidecar override and checks that:

- the participant obtains its certificate through the tunnel (TLS-ALPN-01 via
  the ingress) and clients see that certificate, so TLS ends at the
  participant;
- the participant is reachable over HTTPS through the ingress, and unknown
  names are not routed;
- the participant's request limit applies;
- the policy blocks other participant ports.

It needs Docker with `/dev/net/tun` and outbound internet access for
Tailscale's public DERP map.
