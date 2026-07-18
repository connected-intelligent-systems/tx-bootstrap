# Participant-local federated catalog

This service builds a participant-owned catalog snapshot. It obtains the
participant list from the operator directory and requests every remote catalog
through the local EDC, so catalog authentication remains the responsibility of
the participant connector.

The primary interface is REST:

- `GET /v1/datasets` supports `q`, `participantBpn`, `theme`, `contentType`,
  `offset`, and `limit`.
- `GET /v1/datasets/{entryId}` returns one cached dataset and its negotiation
  metadata.
- `GET /v1/participants` reports crawl state and staleness.
- `GET|POST /v1/sparql` provides bounded, read-only SPARQL for trusted clients.

All `/v1` routes require `X-Api-Key`. In normal deployments clients do not call
the service directly: the participant portal gateway authenticates them,
checks scopes, strips caller credentials, and injects the internal service key.
There is intentionally no SPARQL UI in the participant portal.

PyOxigraph persists RDF data under `FEDERATED_CATALOG_STORE_PATH`. A failed
crawl keeps the last successful participant snapshot. Compose uses one named
volume and must not scale this service because multiple processes cannot share
an Oxigraph directory. The Helm StatefulSet creates a separate PVC for every
replica; replicas crawl independently and are eventually consistent.

Run the local checks with:

```sh
uv sync --frozen
.venv/bin/ruff check src tests
.venv/bin/mypy src
.venv/bin/pytest -q
```
