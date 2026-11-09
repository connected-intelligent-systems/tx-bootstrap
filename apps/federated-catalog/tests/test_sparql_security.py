import asyncio
import http.server
import sys
import threading
import time
from collections.abc import Iterator
from datetime import UTC, datetime

import httpx
import pytest
from pyoxigraph import Literal, NamedNode, Quad

from federated_catalog.app import create_app
from federated_catalog.config import Settings
from federated_catalog.models import CrawlStatus, Participant
from federated_catalog.query_worker import QueryExecutionError, QueryTimeoutError
from federated_catalog.store import CatalogStore, live_graph, validate_query

PROVIDER = Participant("Provider", "BPNL000000000001", "did:web:provider.example", "https://provider.example/dsp")
JSON = "application/sparql-results+json"
# Four-way self join; with the fixture's 400 triples this is 25.6G solutions.
HEAVY_QUERY = "SELECT (COUNT(*) AS ?n) WHERE { ?a ?b ?c . ?d ?e ?f . ?g ?h ?i . ?j ?k ?l } LIMIT 1"


class StubCrawler:
    def __init__(self) -> None:
        self.ready = asyncio.Event()
        self.ready.set()

    async def run(self) -> None:
        return None

    async def close(self) -> None:
        return None


def fresh_status() -> CrawlStatus:
    return CrawlStatus(PROVIDER, state="fresh", last_success_at=datetime.now(UTC).isoformat())


def populated_store(path: str, triples: int = 3) -> CatalogStore:
    store = CatalogStore(path, 1800)
    document = "".join(f'<urn:s{index}> <urn:p> "{index}" .\n' for index in range(triples))
    store.replace_catalog(fresh_status(), [], [document])
    return store


@pytest.fixture
def listener() -> Iterator[tuple[str, list[str]]]:
    hits: list[str] = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            self._record()

        def do_POST(self) -> None:
            self._record()

        def _record(self) -> None:
            hits.append(self.path)
            self.send_response(200)
            self.send_header("Content-Type", JSON)
            self.end_headers()
            self.wfile.write(b'{"head":{"vars":[]},"results":{"bindings":[]}}')

        def log_message(self, *_args: object) -> None:
            return None

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}", hits
    server.shutdown()


@pytest.mark.parametrize(
    "query",
    [
        # "<" used as less-than used to blank everything up to the next ">".
        "SELECT * WHERE { FILTER(1 < 2) SERVICE <http://10.0.0.1/x> { ?s ?p ?o } } LIMIT 1",
        "select * where { filter(1<2) service <http://10.0.0.1/x> { ?s ?p ?o } } limit 1",
        # The same trick hid the missing LIMIT behind a comment.
        "SELECT * WHERE { ?a ?b ?c FILTER(1 < 2) } # > LIMIT 10",
        "SELECT * WHERE { ?s ?p 'unterminated } LIMIT 1",
    ],
)
def test_validation_rejects_less_than_bypasses(query: str) -> None:
    with pytest.raises(ValueError):
        validate_query(query, 1000)


@pytest.mark.parametrize(
    "query",
    [
        "SELECT * WHERE { ?s ?p ?o FILTER(?o < 5 && ?o > 1) } LIMIT 10",
        "SELECT ?add ?with WHERE { ?add <http://www.w3.org/ns/dcat#theme> ?with } LIMIT 10",
        'SELECT * WHERE { ?s ?p """a SERVICE\nliteral""" } LIMIT 10',
        "SELECT * WHERE { ?s ?p ?o } # SERVICE in a comment\nLIMIT 10",
    ],
)
def test_validation_accepts_legitimate_queries(query: str) -> None:
    assert validate_query(query, 1000) == "SELECT"


@pytest.mark.skipif(sys.platform != "linux", reason="the seccomp network sandbox is Linux-only")
def test_service_cannot_reach_the_network_even_when_validation_is_fooled(
    tmp_path, listener: tuple[str, list[str]]
) -> None:
    url, hits = listener
    # Oxigraph parses "<?b#>" as less-than plus a comment, a lexer as an IRI.
    # No text filter can mirror this exactly, so the sandbox must hold.
    query = (
        'SELECT * WHERE { BIND(1 AS ?a) BIND(2 AS ?b) FILTER(?a <?b#> """\n'
        f") SERVICE <{url}/ssrf> {{ ?s ?p ?o }}\n"
        '# """\n'
        "} LIMIT 1"
    )
    assert validate_query(query, 1000) == "SELECT"
    store = populated_store(str(tmp_path / "store"))

    with pytest.raises(QueryExecutionError) as raised:
        store.query(query, JSON, 1000, 10_000, timeout_seconds=20, sandbox="required")

    assert hits == []
    assert not raised.value.client_error
    assert url not in str(raised.value)


def test_timed_out_query_is_killed_and_store_stays_usable(tmp_path, sparql_sandbox: str) -> None:
    store = populated_store(str(tmp_path / "store"), triples=400)

    started = time.monotonic()
    with pytest.raises(QueryTimeoutError):
        store.query(HEAVY_QUERY, JSON, 1000, 10_000, timeout_seconds=1, sandbox=sparql_sandbox)
    assert time.monotonic() - started < 10

    payload, _ = store.query(
        "SELECT ?o WHERE { <urn:s1> <urn:p> ?o } LIMIT 1", JSON, 1000, 10_000, sandbox=sparql_sandbox
    )
    assert b'"1"' in payload


def test_queries_see_published_writes_and_old_snapshots_are_removed(tmp_path, sparql_sandbox: str) -> None:
    store = populated_store(str(tmp_path / "store"))
    store.store.add(Quad(NamedNode("urn:unpublished"), NamedNode("urn:p"), Literal("x"), live_graph(PROVIDER.bpn)))
    query = "ASK { <urn:unpublished> ?p ?o }"

    assert b"false" in store.query(query, JSON, 1000, 10_000, sandbox=sparql_sandbox)[0]
    store.put_status(fresh_status())
    assert b"true" in store.query(query, JSON, 1000, 10_000, sandbox=sparql_sandbox)[0]
    assert len(list(store.snapshots.root.iterdir())) == 1


@pytest.mark.asyncio
async def test_long_query_does_not_block_health_or_other_requests(tmp_path, sparql_sandbox: str) -> None:
    configured = Settings(
        store_path=str(tmp_path / "store"),
        api_key="secret",
        sparql_timeout_seconds=3,
        sparql_sandbox=sparql_sandbox,
    )
    store = populated_store(configured.store_path, triples=400)
    app = create_app(configured, store, StubCrawler())  # type: ignore[arg-type]
    headers = {"X-Api-Key": "secret", "Content-Type": "application/sparql-query"}

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://catalog") as client:
        heavy = asyncio.create_task(client.post("/v1/sparql", content=HEAVY_QUERY, headers=headers))
        await asyncio.sleep(0.5)

        started = time.monotonic()
        live = await client.get("/health/live")
        assert live.status_code == 200
        assert time.monotonic() - started < 1
        busy = await client.post("/v1/sparql", content="ASK { ?s ?p ?o }", headers=headers)
        assert busy.status_code == 503

        assert (await heavy).status_code == 504
        after = await client.post("/v1/sparql", content="ASK { ?s ?p ?o }", headers=headers)
        assert after.status_code == 200
