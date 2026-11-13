# Participant API specification

The participant backend serves the generated API contract at
`/api/openapi.json`. It describes the allowed connector and catalog operations,
data proxy, bearer-token authentication, and required scopes. See
[Participant API access](../../../../../docs/participant.md#api-access).

## Regenerate

Edit `gateway-operations.json` when changing the allowed API operations.
When upgrading EDC, update the pinned upstream version in the generator too;
it currently uses the Tractus-X EDC `0.13.0` control-plane specification.

From the repository root:

```sh
npm run openapi:generate --workspace @tx-bootstrap/participant-portal
npm run test --workspace @tx-bootstrap/participant-portal
```

Commit the regenerated `participant-api.openapi.json`. Edit the allowlist and
generator rather than the generated contract. Tests check operation coverage
and schema references.
