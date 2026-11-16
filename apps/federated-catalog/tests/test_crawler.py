import asyncio
import json
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
    assert len([call for call in calls if call.url.path.endswith("/catalog/request")]) == 2
    await client.aclose()


@pytest.mark.asyncio
async def test_catalog_requests_use_the_discovered_dsp_version(tmp_path) -> None:
    configured = settings(tmp_path)
    store = CatalogStore(configured.store_path, 1800)
    provider = Participant("Provider", "BPNL-PROVIDER", "did:web:provider", "https://provider.example/dsp")
    catalog_requests: list[dict[str, object]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if request.url.path.endswith("/connectordiscovery/dspversionparams"):
            assert body["counterPartyAddress"] == "https://provider.example/dsp"
            assert body["counterPartyId"] == "did:web:provider"
            return httpx.Response(
                200,
                json={
                    "counterPartyAddress": "https://provider.example/dsp/2025-1",
                    "protocol": "dataspace-protocol-http:2025-1",
                },
            )
        catalog_requests.append(body)
        return httpx.Response(200, json={"@context": context(), "dcat:dataset": [dataset("one")]})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    await CatalogCrawler(configured, store, client).crawl_participant(provider)

    assert catalog_requests[0]["counterPartyAddress"] == "https://provider.example/dsp/2025-1"
    assert catalog_requests[0]["protocol"] == "dataspace-protocol-http:2025-1"
    status = store.get_status(provider.bpn)
    assert status is not None and status.state == "fresh"
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


@pytest.mark.asyncio
async def test_malformed_dsp_endpoint_does_not_stop_directory_sync(tmp_path) -> None:
    # "{" passes WHATWG URL parsing (it is percent-encoded there) but is not a
    # valid IRI code point, so it used to abort every crawl cycle.
    bad = {"name": "Bad", "bpn": "BPNL-BAD", "did": "did:web:bad", "dspEndpoint": "https://bad.example/{dsp}"}
    good = {"name": "Good", "bpn": "BPNL-GOOD", "did": "did:web:good", "dspEndpoint": "https://good.example/dsp"}

    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"participants": [bad, good]})

    configured = settings(tmp_path)
    store = CatalogStore(configured.store_path, 1800)
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    crawler = CatalogCrawler(configured, store, client)

    participants = await crawler.fetch_participants()
    assert [item.bpn for item in participants] == ["BPNL-GOOD"]

    # Even if a malformed entry reaches synchronization, the others still sync.
    malformed = Participant("Bad", "BPNL-BAD", "did:web:bad", "https://bad.example/{dsp}")
    await crawler.synchronize_directory([malformed, *participants])
    assert [status.participant.bpn for status in store.statuses()] == ["BPNL-GOOD"]
    await client.aclose()


def directory_response(*participants: Participant) -> httpx.Response:
    return httpx.Response(200, json={"participants": [participant.public_dict() for participant in participants]})


@pytest.mark.asyncio
async def test_failed_crawl_is_retried_quickly_and_then_backs_off(tmp_path) -> None:
    configured = settings(tmp_path, retry_seconds=60, crawl_interval_seconds=900)
    store = CatalogStore(configured.store_path, 1800)
    provider = Participant("Provider", "BPNL-PROVIDER", "did:web:provider", "https://provider.example/dsp")

    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.RemoteProtocolError("Server disconnected without sending a response.", request=request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    crawler = CatalogCrawler(configured, store, client)
    delays = []
    for _ in range(4):
        before = asyncio.get_running_loop().time()
        await crawler.crawl_participant(provider)
        delays.append(round(crawler.next_crawl[provider.bpn] - before))

    assert delays == [60, 900, 1800, 3600]
    status = store.get_status(provider.bpn)
    assert status is not None and status.last_error == "Upstream request failed (RemoteProtocolError)"
    await client.aclose()


@pytest.mark.asyncio
async def test_run_loop_retries_a_failed_crawl_without_waiting_for_the_directory(tmp_path) -> None:
    configured = settings(tmp_path, retry_seconds=1, directory_interval_seconds=300)
    store = CatalogStore(configured.store_path, 1800)
    provider = Participant("Provider", "BPNL-PROVIDER", "did:web:provider", "https://provider.example/dsp")
    catalog_requests = 0
    retried = asyncio.Event()

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal catalog_requests
        if request.method == "GET":
            return directory_response(provider)
        if request.url.path.endswith("/catalog/request"):
            catalog_requests += 1
            if catalog_requests == 1:
                raise httpx.ConnectError("Connection refused", request=request)
            retried.set()
            return httpx.Response(200, json={"@context": context(), "dcat:dataset": [dataset("one")]})
        return httpx.Response(404)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    crawler = CatalogCrawler(configured, store, client)
    task = asyncio.create_task(crawler.run())
    try:
        await asyncio.wait_for(retried.wait(), timeout=10)
    finally:
        # The loop finishes the running crawl before it stops.
        await crawler.close()
        await task
    status = store.get_status(provider.bpn)
    assert status is not None and status.state == "fresh"
    assert catalog_requests == 2
    await client.aclose()


@pytest.mark.asyncio
async def test_manual_refresh_wakes_the_crawler_and_has_a_cooldown(tmp_path) -> None:
    configured = settings(tmp_path, manual_refresh_cooldown_seconds=30)
    store = CatalogStore(configured.store_path, 1800)
    provider = Participant("Provider", "BPNL-PROVIDER", "did:web:provider", "https://provider.example/dsp")
    consumer = Participant("Consumer", "BPNL-CONSUMER", "did:web:consumer", "https://consumer.example/dsp")
    catalog_requests: list[str] = []
    requested = asyncio.Event()

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return directory_response(provider, consumer)
        if request.url.path.endswith("/catalog/request"):
            catalog_requests.append(json.loads(request.content)["counterPartyId"])
            requested.set()
            return httpx.Response(200, json={"@context": context(), "dcat:dataset": []})
        return httpx.Response(404)

    async def requests_reach(count: int) -> None:
        while len(catalog_requests) < count:
            requested.clear()
            await requested.wait()

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    crawler = CatalogCrawler(configured, store, client)
    task = asyncio.create_task(crawler.run())
    try:
        async with asyncio.timeout(10):
            await requests_reach(2)
            # Both were just crawled; the next regular crawl is 15 minutes away.
            assert await crawler.request_refresh(provider.bpn) == [provider.bpn]
            await requests_reach(3)
        assert catalog_requests[2] == "did:web:provider"
        assert await crawler.request_refresh(provider.bpn) == []
        assert await crawler.request_refresh() == [consumer.bpn]
        with pytest.raises(KeyError):
            await crawler.request_refresh("BPNL-UNKNOWN")
    finally:
        await crawler.close()
        await task
    await client.aclose()


@pytest.mark.asyncio
async def test_manual_refresh_during_a_running_crawl_is_not_lost(tmp_path) -> None:
    configured = settings(tmp_path)
    store = CatalogStore(configured.store_path, 1800)
    provider = Participant("Provider", "BPNL-PROVIDER", "did:web:provider", "https://provider.example/dsp")
    catalog_requests = 0
    first_request_seen = asyncio.Event()
    release_first_request = asyncio.Event()
    second_request_seen = asyncio.Event()

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal catalog_requests
        if request.method == "GET":
            return directory_response(provider)
        if request.url.path.endswith("/catalog/request"):
            catalog_requests += 1
            if catalog_requests == 1:
                first_request_seen.set()
                await release_first_request.wait()
            else:
                second_request_seen.set()
            return httpx.Response(200, json={"@context": context(), "dcat:dataset": []})
        return httpx.Response(404)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    crawler = CatalogCrawler(configured, store, client)
    task = asyncio.create_task(crawler.run())
    try:
        await asyncio.wait_for(first_request_seen.wait(), timeout=10)
        # The refresh arrives while the first crawl is still waiting for its answer.
        assert await crawler.request_refresh(provider.bpn) == [provider.bpn]
        release_first_request.set()
        await asyncio.wait_for(second_request_seen.wait(), timeout=10)
    finally:
        await crawler.close()
        await task
    await client.aclose()
