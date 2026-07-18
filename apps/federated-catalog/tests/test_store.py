from datetime import UTC, datetime, timedelta

import pytest

from federated_catalog.models import CrawlStatus, DatasetRecord, Participant
from federated_catalog.store import CONTROL_GRAPH, PUBLIC_GRAPH, CatalogStore, stable_entry_id, validate_query


def participant(bpn: str = "BPNL000000000001") -> Participant:
    return Participant("Provider", bpn, "did:web:provider.example", "https://provider.example/api/v1/dsp")


def record(provider: Participant, dataset_id: str = "dataset-1") -> DatasetRecord:
    return DatasetRecord(
        entry_id=stable_entry_id(provider.bpn, dataset_id),
        dataset_id=dataset_id,
        participant=provider,
        crawled_at=datetime.now(UTC).isoformat(),
        dataset={"@id": dataset_id, "@type": "dcat:Dataset", "dct:title": "Mobility data"},
        title=["Mobility data"],
        description=["Road conditions"],
        abstract=[],
        keywords=["traffic"],
        themes=["mobility"],
        content_types=["application/json"],
    )


def status(provider: Participant, *, success: datetime | None = None) -> CrawlStatus:
    return CrawlStatus(
        participant=provider,
        state="fresh",
        dataset_count=1,
        last_attempt_at=datetime.now(UTC).isoformat(),
        last_success_at=(success or datetime.now(UTC)).isoformat(),
    )


def test_search_filter_detail_and_persisted_restart(tmp_path) -> None:
    provider = participant()
    path = str(tmp_path / "store")
    store = CatalogStore(path, stale_after_seconds=1800)
    item = record(provider)
    store.replace_catalog(status(provider), [item], ['<urn:dataset-1> <urn:title> "Mobility data" .'])

    result = store.search(
        query="ROAD",
        participant_bpn=provider.bpn,
        theme="mobility",
        content_type="application/json",
        offset=0,
        limit=20,
    )

    assert result["total"] == 1
    assert result["items"][0]["counterPartyId"] == provider.did
    assert store.get_dataset(item.entry_id)["datasetId"] == "dataset-1"  # type: ignore[index]
    del store
    reopened = CatalogStore(path, stale_after_seconds=1800)
    assert reopened.has_snapshot()
    assert (
        reopened.search(
            query=None,
            participant_bpn=None,
            theme=None,
            content_type=None,
            offset=0,
            limit=20,
        )["total"]
        == 1
    )


def test_failed_replacement_retains_last_known_good(tmp_path) -> None:
    provider = participant()
    store = CatalogStore(str(tmp_path / "store"), stale_after_seconds=1800)
    original = record(provider)
    store.replace_catalog(status(provider), [original], ['<urn:dataset-1> <urn:title> "one" .'])

    with pytest.raises(SyntaxError):
        store.replace_catalog(status(provider), [record(provider, "dataset-2")], ["not rdf"])

    assert store.get_dataset(original.entry_id) is not None
    assert store.get_dataset(stable_entry_id(provider.bpn, "dataset-2")) is None


def test_directory_metadata_change_is_used_with_last_known_good_snapshot(tmp_path) -> None:
    provider = participant()
    store = CatalogStore(str(tmp_path / "store"), stale_after_seconds=1800)
    item = record(provider)
    crawl_status = status(provider)
    store.replace_catalog(crawl_status, [item], ['<urn:dataset-1> <urn:title> "one" .'])

    changed = Participant("Renamed", provider.bpn, "did:web:new.example", "https://new.example/api/v1/dsp")
    crawl_status.participant = changed
    crawl_status.state = "error"
    store.put_status(crawl_status)

    result = store.search(
        query=None,
        participant_bpn=None,
        theme=None,
        content_type=None,
        offset=0,
        limit=20,
    )
    assert result["items"][0]["participant"] == changed.public_dict()
    assert store.get_dataset(item.entry_id)["counterPartyId"] == changed.did  # type: ignore[index]


def test_stale_and_sparql_graph_visibility(tmp_path) -> None:
    provider = participant()
    store = CatalogStore(str(tmp_path / "store"), stale_after_seconds=60)
    store.replace_catalog(
        status(provider, success=datetime.now(UTC) - timedelta(minutes=2)),
        [record(provider)],
        ['<urn:dataset-1> <urn:title> "Mobility data" .'],
    )

    item = store.search(
        query=None,
        participant_bpn=None,
        theme=None,
        content_type=None,
        offset=0,
        limit=20,
    )["items"][0]
    assert item["stale"] is True
    payload, media_type = store.query(
        "SELECT ?s WHERE { ?s <urn:title> ?title } LIMIT 10",
        "application/sparql-results+json",
        1000,
        10_000,
    )
    assert media_type == "application/sparql-results+json"
    assert b"urn:dataset-1" in payload
    hidden, _ = store.query(
        f"SELECT * WHERE {{ GRAPH {CONTROL_GRAPH} {{ ?s ?p ?o }} }} LIMIT 10",
        "application/sparql-results+json",
        1000,
        10_000,
    )
    assert b'"bindings": []' in hidden
    public_query = (
        f"SELECT ?bpn WHERE {{ GRAPH {PUBLIC_GRAPH} "
        "{ ?catalog <urn:tx-bootstrap:federated-catalog:bpn> ?bpn } } LIMIT 10"
    )
    public, _ = store.query(
        public_query,
        "application/sparql-results+json",
        1000,
        10_000,
    )
    assert provider.bpn.encode() in public


@pytest.mark.parametrize(
    "query",
    [
        "SELECT * WHERE { ?s ?p ?o }",
        "SELECT * WHERE { SERVICE <https://example.com/sparql> { ?s ?p ?o } } LIMIT 10",
        "DELETE WHERE { ?s ?p ?o }",
        "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o } LIMIT 1001",
    ],
)
def test_query_validation_rejects_unbounded_or_unsafe_queries(query: str) -> None:
    with pytest.raises(ValueError):
        validate_query(query, 1000)


def test_query_validation_allows_read_forms() -> None:
    assert validate_query("ASK { ?s ?p ?o }", 1000) == "ASK"
    assert validate_query("SELECT * WHERE { ?s ?p ?o } LIMIT 100", 1000) == "SELECT"
