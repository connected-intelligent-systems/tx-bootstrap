import asyncio
from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient

from federated_catalog.app import create_app
from federated_catalog.config import Settings
from federated_catalog.models import CrawlStatus, DatasetRecord, Participant
from federated_catalog.store import CatalogStore, stable_entry_id


class StubCrawler:
    def __init__(self) -> None:
        self.ready = asyncio.Event()
        self.ready.set()
        self.stop = asyncio.Event()

    async def run(self) -> None:
        await self.stop.wait()

    async def close(self) -> None:
        self.stop.set()


def test_rest_and_sparql_api_are_key_protected_and_bounded(tmp_path) -> None:
    configured = Settings(store_path=str(tmp_path / "store"), api_key="secret")
    store = CatalogStore(configured.store_path, 1800)
    provider = Participant("Provider", "BPNL1", "did:web:provider", "https://provider.example/dsp")
    crawled_at = datetime.now(UTC).isoformat()
    item = DatasetRecord(
        entry_id=stable_entry_id(provider.bpn, "dataset-1"),
        dataset_id="dataset-1",
        participant=provider,
        crawled_at=crawled_at,
        dataset={"@id": "dataset-1", "dct:title": "Mobility"},
        title=["Mobility"],
        description=[],
        abstract=[],
        keywords=[],
        themes=[],
        content_types=[],
    )
    store.replace_catalog(
        CrawlStatus(provider, state="fresh", dataset_count=1, last_success_at=crawled_at),
        [item],
        ['<urn:dataset-1> <urn:title> "Mobility" .'],
    )
    app = create_app(configured, store, StubCrawler())  # type: ignore[arg-type]

    with TestClient(app) as client:
        assert client.get("/v1/datasets").status_code == 401
        response = client.get("/v1/datasets?q=mobility", headers={"X-Api-Key": "secret"})
        assert response.status_code == 200
        assert response.json()["items"][0]["datasetId"] == "dataset-1"
        assert client.get(f"/v1/datasets/{item.entry_id}", headers={"X-Api-Key": "secret"}).status_code == 200

        unbounded = client.get(
            "/v1/sparql",
            params={"query": "SELECT * WHERE { ?s ?p ?o }"},
            headers={"X-Api-Key": "secret"},
        )
        assert unbounded.status_code == 400
        sparql = client.post(
            "/v1/sparql",
            content="SELECT * WHERE { ?s ?p ?o } LIMIT 10",
            headers={"X-Api-Key": "secret", "Content-Type": "application/sparql-query"},
        )
        assert sparql.status_code == 200
        assert sparql.headers["content-type"].startswith("application/sparql-results+json")


def test_sparql_update_and_service_are_rejected(tmp_path) -> None:
    configured = Settings(store_path=str(tmp_path / "store"), api_key="secret")
    app = create_app(configured, CatalogStore(configured.store_path, 1800), StubCrawler())  # type: ignore[arg-type]
    headers = {"X-Api-Key": "secret", "Content-Type": "application/sparql-query"}
    queries: list[tuple[str, dict[str, Any]]] = [
        ("DELETE WHERE { ?s ?p ?o }", {}),
        ("SELECT * WHERE { SERVICE <https://example.com> { ?s ?p ?o } } LIMIT 1", {}),
    ]
    with TestClient(app) as client:
        for query, _metadata in queries:
            assert client.post("/v1/sparql", content=query, headers=headers).status_code == 400
