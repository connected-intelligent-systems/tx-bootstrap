# Participant API OpenAPI

`gateway-operations.json` is the shared allowlist for gateway authorization and
API documentation. `participant-api.openapi.json` is generated from that
allowlist and the versioned Tractus-X EDC 0.12.1 control-plane OpenAPI artifact.
It adds the participant-local federated-catalog operations, bearer-token
authentication, and `x-required-scope` metadata.

Do not edit the generated specification manually. After changing the allowlist
or upgrading Tractus-X EDC, update the pinned source and version checks in the
generator, then run:

```sh
npm run openapi:generate --workspace apps/participant-portal
```

The portal backend serves the generated contract at `/api/openapi.json`. Tests
verify that it documents exactly the allowlisted gateway operations and that all
local component references resolve.
