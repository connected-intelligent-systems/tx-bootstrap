# Operator services

The operator manages participant onboarding and the services that establish
trust in the dataspace:

- **Operator console:** create participants, send invitations, and handle
  failed connector setup.
- **Onboarding service:** the public API used by participant portals.
- **Issuer Identity Hub and Issuer Service:** manage the operator's identity
  and issue participant credentials.
- **BDRS:** resolve participant business partner numbers (BPNs) to DIDs.

## Deploy

For a complete demo, follow [Local Compose](local-deployment.md). The local
console is at <http://localhost:39080>; the onboarding API is at
<http://localhost:39085/api>.

For a reusable deployment, provision PostgreSQL and Vault first, then configure
the [Compose application](../deploy/README.md) or
[operator Helm chart](../deploy/helm/operator/README.md).

## Onboard a participant

1. Create the participant in the operator console and confirm its assigned
   BPN and verification details.
2. Share the invitation token securely with the participant. If needed,
   select **Publish through the operator tunnel** to include tunnel settings.
3. The participant starts its connector and portal using the assigned BPN and
   invitation token.
4. Once the BPN is verified and connector endpoints have been submitted, the
   operator services prepare directory and issuer state automatically. The
   participant portal requests credentials from its own Identity Hub.
5. If setup fails, review the failed checks in the console, correct the
   endpoints or configuration, and retry.

The participant guide covers [the participant's steps](participant.md#onboarding).

## Public and administrative access

Expose the onboarding API and issuer gateway through HTTPS:

| Route                                        | Purpose                |
| -------------------------------------------- | ---------------------- |
| `/api/onboarding-cases*`                     | Participant onboarding |
| `/.well-known/did.json` and issuer DID paths | Identity resolution    |
| `/statuslist/*`                              | Credential status      |
| `/api/issuance/*`                            | Credential issuance    |
| `/api/directory/*`                           | BPN-to-DID lookup      |
| `/.well-known/api/*`                         | Service discovery      |

Keep the console, BDRS management, issuer administration, Vault, and PostgreSQL
on administrative networks. The console supports `api-key` authentication or
`forwarded-header` behind a trusted authentication proxy. API-key mode requires
`OPERATOR_CONSOLE_API_KEY`; the web console then asks for the key and keeps it
for the browser tab only, and scripts send it in the `x-api-key` header.
Forwarded-header mode requires the proxy to replace caller-supplied identity
headers.

The issuer's DID document advertises `https://<ISSUER_DID_HOST>/api/issuance`
as its credential service, which participants call to request credentials.
Set `ISSUER_ISSUANCE_URL` in Compose if the issuer is published under another
public URL.

The local demo uses loopback-only administrative ports with `network` auth
mode. Use authenticated access for non-local deployments.

Participant status and metadata updates require the invitation token in the
`x-participant-token` header. Keep it out of URLs and logs.

## Optional tunnel enrollment

The console can issue and revoke participant tunnel keys through an external
Headscale server. This feature is disabled by default. Setup, invitation
lifetimes, and the **Tunnel** tab are covered in
[Participant tunnel](participant-tunnel.md#operator).

For all Compose settings, see the
[operator manifest](../deploy/compose/operator.compose.yaml). For application
build and test commands, see [Development](development.md).
