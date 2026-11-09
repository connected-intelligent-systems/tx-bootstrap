# Federated catalog

The service maintains a participant-owned catalog snapshot. It discovers
participants through the operator directory and requests their catalogs through
the local connector. A failed crawl keeps the last successful snapshot.

Clients normally use the participant portal API under
`/api/federated-catalog/v1` with a scoped bearer token. See
[Participant API access](../../docs/participant.md#api-access).

## Internal API

The private service requires `X-Api-Key` on all `/v1` routes:

| Route                        | Purpose                         |
| ---------------------------- | ------------------------------- |
| `GET /v1/datasets`           | Search and filter datasets      |
| `GET /v1/datasets/{entryId}` | Dataset and negotiation details |
| `GET /v1/participants`       | Crawl state and freshness       |
| `GET` or `POST /v1/sparql`   | Bounded, read-only SPARQL       |

Persist `FEDERATED_CATALOG_STORE_PATH`. Compose must use one replica; multiple
processes cannot share the same storage directory. Helm gives each replica its
own volume and independent snapshot.

### SPARQL isolation

Each SPARQL query runs in a separate process against a read-only checkpoint of
the store, written to `FEDERATED_CATALOG_SNAPSHOT_PATH` (default
`<store path>-query-snapshots`). Keep it on the same volume as the store so
checkpoints are hard links. A query that exceeds `SPARQL_TIMEOUT_SECONDS` is
killed.

On Linux the query process installs a seccomp filter that blocks all network
sockets before evaluation, so `SERVICE` clauses cannot reach other hosts even
if they get past the query validator. With the default
`SPARQL_NETWORK_SANDBOX=required`, queries fail if the filter cannot be
installed. Set `best-effort` only for local development on other platforms.

## Development

From the repository root:

```sh
uv sync --locked --project apps/federated-catalog
uv run --locked --project apps/federated-catalog ruff check apps/federated-catalog/src apps/federated-catalog/tests
uv run --locked --project apps/federated-catalog mypy apps/federated-catalog/src
uv run --locked --project apps/federated-catalog pytest -q apps/federated-catalog/tests
```

[config.py](src/federated_catalog/config.py) lists crawl and query settings.
