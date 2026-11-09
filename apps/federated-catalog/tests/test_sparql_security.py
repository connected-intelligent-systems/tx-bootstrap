import asyncio
import time
from datetime import UTC, datetime

import httpx
import pytest
from pyoxigraph import Literal, NamedNode, Quad

from federated_catalog.app import create_app
from federated_catalog.config import Settings
from federated_catalog.models import CrawlStatus, Participant
from federated_catalog.query_worker import QueryTimeoutError
from federated_catalog.store import CatalogStore, live_graph

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


def test_timed_out_query_is_killed_and_store_stays_usable(tmp_path) -> None:
    store = populated_store(str(tmp_path / "store"), triples=400)

    started = time.monotonic()
    with pytest.raises(QueryTimeoutError):
        store.query(HEAVY_QUERY, JSON, 1000, 10_000, timeout_seconds=1)
    assert time.monotonic() - started < 10

    payload, _ = store.query("SELECT ?o WHERE { <urn:s1> <urn:p> ?o } LIMIT 1", JSON, 1000, 10_000)
    assert b'"1"' in payload


def test_queries_see_published_writes_and_old_snapshots_are_removed(tmp_path) -> None:
    store = populated_store(str(tmp_path / "store"))
    store.store.add(Quad(NamedNode("urn:unpublished"), NamedNode("urn:p"), Literal("x"), live_graph(PROVIDER.bpn)))
    query = "ASK { <urn:unpublished> ?p ?o }"

    assert b"false" in store.query(query, JSON, 1000, 10_000)[0]
    store.put_status(fresh_status())
    assert b"true" in store.query(query, JSON, 1000, 10_000)[0]
    assert len(list(store.snapshots.root.iterdir())) == 1


@pytest.mark.asyncio
async def test_long_query_does_not_block_health_or_other_requests(tmp_path) -> None:
    configured = Settings(
        store_path=str(tmp_path / "store"),
        api_key="secret",
        sparql_timeout_seconds=3,
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
