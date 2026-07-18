from __future__ import annotations

import asyncio
import logging
import random
from datetime import UTC, datetime
from typing import Any

import httpx

from .config import Settings
from .jsonld import (
    SecureDocumentLoader,
    extract_datasets,
    json_strings,
    prepare_dataset,
    rdf_nquads,
)
from .models import CrawlStatus, DatasetRecord, Participant, iso, parse_time, utc_now
from .store import CatalogStore, stable_entry_id

LOGGER = logging.getLogger(__name__)


class CatalogCrawler:
    def __init__(self, settings: Settings, store: CatalogStore, client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self.store = store
        self.client = client or httpx.AsyncClient(timeout=settings.request_timeout_seconds)
        self.owns_client = client is None
        self.document_loader = SecureDocumentLoader(settings.request_timeout_seconds, settings.context_max_bytes)
        self.ready = asyncio.Event()
        self.stop = asyncio.Event()
        self.next_crawl: dict[str, float] = {}
        self.failures: dict[str, int] = {}

    async def close(self) -> None:
        self.stop.set()
        if self.owns_client:
            await self.client.aclose()

    async def run(self) -> None:
        while not self.stop.is_set():
            try:
                await self.run_cycle()
            except Exception as error:
                # A directory outage must not deactivate participants or stop future refreshes.
                LOGGER.warning("Federated catalog refresh failed: %s", self._error_message(error))
            finally:
                self.ready.set()
            try:
                await asyncio.wait_for(self.stop.wait(), timeout=self.settings.directory_interval_seconds)
            except TimeoutError:
                pass

    async def run_cycle(self) -> None:
        participants = await self.fetch_participants()
        await self.synchronize_directory(participants)
        now = asyncio.get_running_loop().time()
        due = [participant for participant in participants if now >= self.next_crawl.get(participant.bpn, 0)]
        semaphore = asyncio.Semaphore(self.settings.crawl_concurrency)

        async def crawl(participant: Participant) -> None:
            async with semaphore:
                await self.crawl_participant(participant)

        await asyncio.gather(*(crawl(participant) for participant in due))
        await self.purge_removed()

    async def fetch_participants(self) -> list[Participant]:
        response = await self.client.get(f"{self.settings.directory_url}/network/participants")
        response.raise_for_status()
        payload = response.json()
        result = []
        for value in payload.get("participants", []):
            if value.get("bpn") == self.settings.participant_bpn:
                continue
            if not all(value.get(key) for key in ("name", "bpn", "did", "dspEndpoint")):
                continue
            result.append(
                Participant(
                    name=value["name"],
                    bpn=value["bpn"],
                    did=value["did"],
                    dsp_endpoint=value["dspEndpoint"],
                )
            )
        return result

    async def synchronize_directory(self, participants: list[Participant]) -> None:
        current = {participant.bpn: participant for participant in participants}
        for participant in participants:
            status = self.store.get_status(participant.bpn)
            if status is None:
                self.store.put_status(CrawlStatus(participant=participant))
                continue
            if status.participant != participant or not status.active:
                status.participant = participant
                status.active = True
                status.inactive_since = None
                status.state = "pending"
                self.next_crawl[participant.bpn] = 0
                self.store.put_status(status)
        now = iso(utc_now())
        for status in self.store.statuses():
            if status.active and status.participant.bpn not in current:
                status.active = False
                status.state = "inactive"
                status.inactive_since = now
                self.store.deactivate(status)

    async def crawl_participant(self, participant: Participant) -> None:
        status = self.store.get_status(participant.bpn) or CrawlStatus(participant=participant)
        status.participant = participant
        status.last_attempt_at = iso(utc_now())
        records: list[DatasetRecord] = []
        rdf_documents: list[str] = []
        degraded = False
        try:
            offset = 0
            while True:
                response = await self.client.post(
                    f"{self.settings.edc_management_url}/v3/catalog/request",
                    headers={"X-Api-Key": self.settings.edc_api_key, "Content-Type": "application/json"},
                    json={
                        "@context": {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"},
                        "counterPartyAddress": participant.dsp_endpoint,
                        "counterPartyId": participant.did,
                        "protocol": "dataspace-protocol-http",
                        "querySpec": {"offset": offset, "limit": self.settings.page_size},
                    },
                )
                response.raise_for_status()
                catalog = response.json()
                if not isinstance(catalog, dict):
                    raise ValueError("EDC catalog response must be a JSON object")
                datasets = extract_datasets(catalog)
                crawled_at = iso(utc_now()) or ""
                for source in datasets:
                    dataset_id = source.get("@id")
                    if not isinstance(dataset_id, str) or not dataset_id:
                        degraded = True
                        continue
                    compacted, document = await asyncio.to_thread(
                        self._prepare_dataset,
                        source,
                        catalog.get("@context"),
                        participant.dsp_endpoint,
                    )
                    records.append(self._record(participant, dataset_id, compacted, crawled_at))
                    rdf_documents.append(document)
                if len(datasets) < self.settings.page_size:
                    break
                offset += self.settings.page_size
            status.state = "degraded" if degraded else "fresh"
            status.dataset_count = len(records)
            status.last_success_at = iso(utc_now())
            status.last_error = None
            status.active = True
            status.inactive_since = None
            await asyncio.to_thread(self.store.replace_catalog, status, records, rdf_documents)
            self.failures[participant.bpn] = 0
            jitter = random.uniform(0.8, 1.2)
            self.next_crawl[participant.bpn] = asyncio.get_running_loop().time() + (
                self.settings.crawl_interval_seconds * jitter
            )
        except Exception as error:
            status.state = "error"
            status.last_error = self._error_message(error)
            self.store.put_status(status)
            failures = self.failures.get(participant.bpn, 0) + 1
            self.failures[participant.bpn] = failures
            delay = min(self.settings.crawl_interval_seconds * (2 ** (failures - 1)), 3600)
            self.next_crawl[participant.bpn] = asyncio.get_running_loop().time() + delay

    @staticmethod
    def _error_message(error: Exception) -> str:
        if isinstance(error, httpx.HTTPStatusError):
            return f"Upstream returned HTTP {error.response.status_code}"
        if isinstance(error, httpx.RequestError):
            return f"Upstream request failed ({type(error).__name__})"
        return f"{type(error).__name__}: {error}"[:500]

    def _record(
        self, participant: Participant, dataset_id: str, dataset: dict[str, Any], crawled_at: str
    ) -> DatasetRecord:
        return DatasetRecord(
            entry_id=stable_entry_id(participant.bpn, dataset_id),
            dataset_id=dataset_id,
            participant=participant,
            crawled_at=crawled_at,
            dataset=dataset,
            title=json_strings(dataset.get("dct:title")) + json_strings(dataset.get("name")),
            description=json_strings(dataset.get("dct:description")) + json_strings(dataset.get("description")),
            abstract=json_strings(dataset.get("dct:abstract")) + json_strings(dataset.get("abstract")),
            keywords=json_strings(dataset.get("dcat:keyword")) + json_strings(dataset.get("keywords")),
            themes=json_strings(dataset.get("dcat:theme")) + json_strings(dataset.get("theme")),
            content_types=json_strings(dataset.get("contenttype")) + json_strings(dataset.get("dcat:mediaType")),
        )

    def _prepare_dataset(
        self, source: dict[str, Any], catalog_context: Any, base_iri: str
    ) -> tuple[dict[str, Any], str]:
        compacted, expanded = prepare_dataset(
            source,
            catalog_context,
            base_iri,
            self.document_loader,
        )
        return compacted, rdf_nquads(expanded, base_iri)

    async def purge_removed(self) -> None:
        now = datetime.now(UTC)
        for status in self.store.statuses():
            if status.active:
                continue
            inactive_since = parse_time(status.inactive_since)
            if inactive_since and (now - inactive_since).total_seconds() >= self.settings.removal_grace_seconds:
                self.store.purge(status.participant.bpn)
