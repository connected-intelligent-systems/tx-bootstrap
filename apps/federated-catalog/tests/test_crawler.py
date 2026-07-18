from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest

from federated_catalog.config import Settings
from federated_catalog.crawler import CatalogCrawler
from federated_catalog.models import Participant
from federated_catalog.store import CatalogStore


def settings(tmp_path, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "store_path": str(tmp_path / "store"),
        "api_key": "catalog-key",
        "participant_bpn": "BPNL-SELF",
        "directory_url": "https://directory.example/api",
        "edc_management_url": "https://edc.example/management",
        "edc_api_key": "edc-key",
        "page_size": 2,
    }
    values.update(overrides)
    return Settings(**values)


@pytest.mark.asyncio
async def test_directory_self_exclusion_and_multi_page_crawl(tmp_path) -> None:
    calls: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.method == "GET":
            return httpx.Response(
                200,
                json={
                    "participants": [
                        {
                            "name": "Self",
                            "bpn": "BPNL-SELF",
                            "did": "did:web:self",
                            "dspEndpoint": "https://self.example/dsp",
                        },
                        {
                            "name": "Provider",
                            "bpn": "BPNL-PROVIDER",
                            "did": "did:web:provider",
                            "dspEndpoint": "https://provider.example/dsp",
                        },
                    ]
                },
            )
        body = request.content.decode()
        assert request.headers["x-api-key"] == "edc-key"
        if '"offset":0' in body:
            datasets = [dataset("one"), dataset("two")]
        else:
            datasets = [dataset("three")]
        return httpx.Response(200, json={"@context": context(), "dcat:dataset": datasets})

    configured = settings(tmp_path)
    store = CatalogStore(configured.store_path, 1800)
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    crawler = CatalogCrawler(configured, store, client)
    participants = await crawler.fetch_participants()
    assert [item.bpn for item in participants] == ["BPNL-PROVIDER"]
    await crawler.synchronize_directory(participants)
    await crawler.crawl_participant(participants[0])

    assert (
        store.search(
            query=None,
            participant_bpn=None,
            theme=None,
            content_type=None,
            offset=0,
            limit=20,
        )["total"]
        == 3
    )
    assert len([call for call in calls if call.method == "POST"]) == 2
    await client.aclose()


@pytest.mark.asyncio
async def test_later_page_failure_retains_previous_snapshot(tmp_path) -> None:
    configured = settings(tmp_path)
    store = CatalogStore(configured.store_path, 1800)
    provider = Participant("Provider", "BPNL-PROVIDER", "did:web:provider", "https://provider.example/dsp")
    attempt = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempt
        if b'"offset":0' in request.content:
            attempt += 1
            first_page = [dataset("one"), dataset("two")]
            return httpx.Response(200, json={"@context": context(), "dcat:dataset": first_page})
        if attempt == 1:
            return httpx.Response(200, json={"@context": context(), "dcat:dataset": [dataset("three")]})
        return httpx.Response(502, json={"message": "failed"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    crawler = CatalogCrawler(configured, store, client)
    await crawler.crawl_participant(provider)
    await crawler.crawl_participant(provider)

    result = store.search(
        query=None,
        participant_bpn=None,
        theme=None,
        content_type=None,
        offset=0,
        limit=20,
    )
    assert result["total"] == 3
    crawl_status = store.get_status(provider.bpn)
    assert crawl_status is not None
    assert crawl_status.state == "error"
    assert crawl_status.last_error == "Upstream returned HTTP 502"
    await client.aclose()


@pytest.mark.asyncio
async def test_removed_participant_is_hidden_immediately_and_purged_after_grace(tmp_path) -> None:
    configured = settings(tmp_path, removal_grace_seconds=1)
    store = CatalogStore(configured.store_path, 1800)
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda _request: httpx.Response(500)))
    crawler = CatalogCrawler(configured, store, client)
    provider = Participant("Provider", "BPNL-PROVIDER", "did:web:provider", "https://provider.example/dsp")
    await crawler.synchronize_directory([provider])
    await crawler.crawl_participant(provider)

    # The failed test transport leaves only state, so insert a successful catalog through a second crawler.
    async def catalog_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"@context": context(), "dcat:dataset": [dataset("one")]})

    await client.aclose()
    catalog_client = httpx.AsyncClient(transport=httpx.MockTransport(catalog_handler))
    crawler = CatalogCrawler(configured, store, catalog_client)
    await crawler.crawl_participant(provider)
    await crawler.synchronize_directory([])
    assert (
        store.search(
            query=None,
            participant_bpn=None,
            theme=None,
            content_type=None,
            offset=0,
            limit=20,
        )["total"]
        == 0
    )

    crawl_status = store.get_status(provider.bpn)
    assert crawl_status is not None
    crawl_status.inactive_since = (datetime.now(UTC) - timedelta(seconds=2)).isoformat()
    store.put_status(crawl_status)
    await crawler.purge_removed()
    assert store.get_status(provider.bpn) is None
    await catalog_client.aclose()


def context() -> dict[str, str]:
    return {
        "@vocab": "https://w3id.org/edc/v0.0.1/ns/",
        "dcat": "http://www.w3.org/ns/dcat#",
        "dct": "http://purl.org/dc/terms/",
    }


def dataset(identifier: str) -> dict[str, Any]:
    return {
        "@id": identifier,
        "@type": "dcat:Dataset",
        "dct:title": {"@value": f"Dataset {identifier}", "@language": "en"},
        "dct:description": "Description",
        "dcat:theme": "mobility",
    }
