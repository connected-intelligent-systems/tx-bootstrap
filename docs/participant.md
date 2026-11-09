# Participant runtime

Each participant runs an Identity Hub wallet, EDC control and data planes,
a federated catalog, and a portal for onboarding and data exchange.

## Deploy

Use [Local Compose](local-deployment.md) for a complete provider/consumer demo.
For your own deployment, provision PostgreSQL and an isolated Vault, then use
the [Compose application](../deploy/README.md) or
[participant Helm chart](../deploy/helm/participant/README.md).

The initialization job prepares the wallet and connector keys automatically.
The participant portal stores its onboarding state in PostgreSQL; database
migrations run before the portal starts.

## Onboarding

1. Ask the operator to create an invitation and provide your assigned BPN.
2. Configure `PARTICIPANT_BPN` and `ONBOARDING_REGISTRATION_TOKEN` with those
   values. Keep the token secret.
3. Set your public hostname and the operator's endpoints, then start the stack.
4. Open the participant portal. It submits the DID and connector endpoints,
   waits for operator setup, and requests credentials from the local wallet.
5. Once onboarding is active, use the portal to manage assets, discover data,
   negotiate contracts, and transfer data.

Without an invitation, the portal shows a missing-invite status. An existing
invitation can also be attached through `/api/onboarding/attach`.

## Main configuration

| Setting                                            | Purpose                                               |
| -------------------------------------------------- | ----------------------------------------------------- |
| `PARTICIPANT_BPN`, `PARTICIPANT_BPN_BASE64`        | Assigned BPN and its base64 encoding                  |
| `PARTICIPANT_CONTEXT_ID`                           | Stable, unique connector context ID                   |
| `PARTICIPANT_PUBLIC_HOST`, `PARTICIPANT_DID_HOST`  | Public connector and DID hostnames; usually identical |
| `BPN_ISSUER`, `ISSUER_DID_HOST`, `BDRS_SERVER_URL` | Operator identity and directory endpoint              |
| `ONBOARDING_DATASPACE_ADMIN_API_URL`               | Operator onboarding API URL, including `/api`         |
| `ONBOARDING_REGISTRATION_TOKEN`                    | Invitation supplied by the operator                   |
| `PARTICIPANT_PORTAL_AUTH_MODE`                     | `forwarded-header` for authenticated deployments      |

Use unique database names and credentials per participant. The
[database guide](../deploy/database/README.md) describes provisioning. The
[Compose manifest](../deploy/compose/participant.compose.yaml) is the full
reference for required database, Vault, image, and endpoint variables.

Public URLs default to HTTPS paths under `PARTICIPANT_PUBLIC_HOST`. If your
proxy uses different paths, override the `PUBLIC_*` settings, including
`PUBLIC_DATAPLANE_TOKEN_REFRESH_ENDPOINT`. Keep the trailing slash in
`PUBLIC_DATAPLANE_BASE_URL`.

## Public and private access

Expose only the connector's public routes through HTTPS:

| Route                                         | Purpose                       |
| --------------------------------------------- | ----------------------------- |
| `/{BPN}/did.json` and `/.well-known/did.json` | Participant identity          |
| `/api/v1/dsp/*`                               | Dataspace Protocol            |
| `/api/public/*`                               | Authorized data transfer      |
| `/api/credentials/*`                          | Credential service            |
| `/.well-known/api/*`                          | Version and service discovery |

Keep the portal, management and wallet administration APIs, Vault, and
PostgreSQL on private networks. For participants without public ingress, use
the optional [operator tunnel](participant-tunnel.md).

The portal requires a trusted authentication proxy when using
`forwarded-header`. Set `PARTICIPANT_PORTAL_AUTH_HEADER` to the identity header
that the proxy overwrites. The local demo supplies Basic Auth gateways.
Unauthenticated `none` mode grants administrator access and is suitable only
for isolated development.

## API access

Create scoped machine tokens under **Settings → API clients** in the portal.
Copy the token at creation or rotation; it is shown only once. Send it as:

```text
Authorization: Bearer txb_...
```

The participant-facing API provides:

| Path                            | Purpose                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `/api/management`               | Allowed EDC catalog, asset, contract, and transfer operations |
| `/api/federated-catalog/v1`     | Cached catalog search and read-only SPARQL                    |
| `/api/data/{transferProcessId}` | Access negotiated HTTP data with the `data:proxy` scope       |
| `/api/openapi.json`             | API contract, including each operation's required scope       |

The OpenAPI contract is available without a token on the machine gateway.
Other routes require the matching scope. Local machine API URLs are listed
in the [local guide](local-deployment.md#open-the-portals).

The data proxy handles transfer credentials and token refresh internally.
Additional paths, query parameters, methods, and bodies require the provider
asset to enable the corresponding HTTP proxy capabilities. Prefer this proxy
to retrieving the underlying endpoint and credentials directly.

## API descriptions for shared data

A provider can attach an OpenAPI 3.x JSON or YAML description to an asset.
After a consumer receives access, the portal offers an interactive view bound
to that transfer's data proxy. Transfer credentials stay in the participant
backend. Uploaded server URLs and external references are removed.

For S3-backed assets, see [S3 HTTP-pull](s3-http-pull.md). Application build and
test commands are in [Development](development.md).
