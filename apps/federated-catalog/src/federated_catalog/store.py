from __future__ import annotations

import base64
import hashlib
import itertools
import json
import re
import shutil
import threading
import time
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pyoxigraph import Literal, NamedNode, Quad, RdfFormat, Store, parse

from .models import CrawlStatus, DatasetRecord, parse_time, utc_now
from .query_worker import run_query

BASE = "urn:tx-bootstrap:federated-catalog:"
CONTROL_GRAPH = NamedNode(BASE + "control")
PUBLIC_GRAPH = NamedNode(BASE + "participants")
STATE_PREDICATE = NamedNode(BASE + "state")
RECORD_PREDICATE = NamedNode(BASE + "record")
TYPE_PREDICATE = NamedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")
CATALOG_TYPE = NamedNode(BASE + "ParticipantCatalog")


def _key(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")


def live_graph(bpn: str) -> NamedNode:
    return NamedNode(BASE + "catalog:" + _key(bpn))


def metadata_graph(bpn: str) -> NamedNode:
    return NamedNode(BASE + "metadata:" + _key(bpn))


def status_node(bpn: str) -> NamedNode:
    return NamedNode(BASE + "participant:" + _key(bpn))


def entry_node(entry_id: str) -> NamedNode:
    return NamedNode(BASE + "entry:" + entry_id)


def is_valid_endpoint(value: str) -> bool:
    """True when the value is an absolute HTTP(S) IRI that RDF can represent."""
    if not value.startswith(("http://", "https://")):
        return False
    try:
        NamedNode(value)
    except ValueError:
        return False
    return True


def stable_entry_id(bpn: str, dataset_id: str) -> str:
    return hashlib.sha256(f"{bpn}\0{dataset_id}".encode()).hexdigest()


class CatalogStore:
    def __init__(self, path: str, stale_after_seconds: int, snapshot_path: str | None = None) -> None:
        Path(path).mkdir(parents=True, exist_ok=True)
        self.store = Store(path)
        self.stale_after_seconds = stale_after_seconds
        self.lock = threading.RLock()
        self.snapshots = QuerySnapshots(snapshot_path or path.rstrip("/") + "-query-snapshots")
        self.cleanup_staging_graphs()
        with self.lock:
            self._publish_snapshot()

    def cleanup_staging_graphs(self) -> None:
        with self.lock:
            for graph in list(self.store.named_graphs()):
                if isinstance(graph, NamedNode) and ":staging:" in graph.value:
                    self.store.remove_graph(graph)

    def has_snapshot(self) -> bool:
        return any(status.last_success_at for status in self.statuses())

    def check_health(self) -> None:
        with self.lock:
            next(self.store.quads_for_pattern(None, None, None, CONTROL_GRAPH), None)

    def statuses(self) -> list[CrawlStatus]:
        values: list[CrawlStatus] = []
        with self.lock:
            for quad in self.store.quads_for_pattern(None, STATE_PREDICATE, None, CONTROL_GRAPH):
                if isinstance(quad.object, Literal):
                    values.append(CrawlStatus.from_dict(json.loads(quad.object.value)))
        return sorted(values, key=lambda item: item.participant.name.lower())

    def get_status(self, bpn: str) -> CrawlStatus | None:
        subject = status_node(bpn)
        with self.lock:
            for quad in self.store.quads_for_pattern(subject, STATE_PREDICATE, None, CONTROL_GRAPH):
                if isinstance(quad.object, Literal):
                    return CrawlStatus.from_dict(json.loads(quad.object.value))
        return None

    def put_status(self, status: CrawlStatus) -> None:
        with self.lock:
            self._put_status(status)
            self._publish_snapshot()

    def _put_status(self, status: CrawlStatus) -> None:
        subject = status_node(status.participant.bpn)
        payload = Literal(json.dumps(status.to_dict(), separators=(",", ":"), ensure_ascii=False))
        # Validate everything derived from directory data before mutating, so a
        # malformed entry cannot leave a half-written status behind.
        public_quads = self._public_participant_quads(status)
        existing = list(self.store.quads_for_pattern(subject, None, None, CONTROL_GRAPH))
        for quad in existing:
            self.store.remove(quad)
        self.store.add(Quad(subject, STATE_PREDICATE, payload, CONTROL_GRAPH))
        graph = live_graph(status.participant.bpn)
        for quad in list(self.store.quads_for_pattern(graph, None, None, PUBLIC_GRAPH)):
            self.store.remove(quad)
        self.store.extend(public_quads)

    def _publish_snapshot(self) -> None:
        self.store.flush()
        self.snapshots.publish(self.store)

    @staticmethod
    def _public_participant_quads(status: CrawlStatus) -> list[Quad]:
        graph = live_graph(status.participant.bpn)
        if not status.active:
            return []
        participant = status.participant
        values: dict[NamedNode, NamedNode | Literal] = {
            TYPE_PREDICATE: CATALOG_TYPE,
            NamedNode(BASE + "bpn"): Literal(participant.bpn),
            NamedNode(BASE + "did"): Literal(participant.did),
            NamedNode(BASE + "dspEndpoint"): NamedNode(participant.dsp_endpoint),
            NamedNode("http://purl.org/dc/terms/title"): Literal(participant.name),
        }
        if status.last_success_at:
            values[NamedNode("http://www.w3.org/ns/prov#generatedAtTime")] = Literal(status.last_success_at)
        return [Quad(graph, predicate, value, PUBLIC_GRAPH) for predicate, value in values.items()]

    def replace_catalog(
        self,
        status: CrawlStatus,
        records: list[DatasetRecord],
        rdf_documents: Iterable[str],
    ) -> None:
        suffix = hashlib.sha256(f"{status.participant.bpn}:{utc_now().timestamp()}".encode()).hexdigest()[:16]
        staging_data = NamedNode(BASE + f"staging:data:{suffix}")
        staging_meta = NamedNode(BASE + f"staging:metadata:{suffix}")
        # Fails before any graph is touched if the directory entry is unusable.
        self._public_participant_quads(status)
        with self.lock:
            self.store.add_graph(staging_data)
            self.store.add_graph(staging_meta)
            try:
                for document in rdf_documents:
                    quads = (
                        Quad(quad.subject, quad.predicate, quad.object, staging_data)
                        for quad in parse(document, format=RdfFormat.N_QUADS, rename_blank_nodes=True)
                    )
                    self.store.extend(quads)
                for record in records:
                    self.store.add(
                        Quad(
                            entry_node(record.entry_id),
                            RECORD_PREDICATE,
                            Literal(json.dumps(record.storage_dict(), separators=(",", ":"), ensure_ascii=False)),
                            staging_meta,
                        )
                    )
                current_data = live_graph(status.participant.bpn)
                current_meta = metadata_graph(status.participant.bpn)
                self.store.update(
                    f"DROP SILENT GRAPH {current_data}; "
                    f"MOVE SILENT GRAPH {staging_data} TO GRAPH {current_data}; "
                    f"DROP SILENT GRAPH {current_meta}; "
                    f"MOVE SILENT GRAPH {staging_meta} TO GRAPH {current_meta}"
                )
                self._put_status(status)
                self._publish_snapshot()
            except Exception:
                self.store.remove_graph(staging_data)
                self.store.remove_graph(staging_meta)
                raise

    def deactivate(self, status: CrawlStatus) -> None:
        self.put_status(status)

    def purge(self, bpn: str) -> None:
        with self.lock:
            self.store.remove_graph(live_graph(bpn))
            self.store.remove_graph(metadata_graph(bpn))
            subject = status_node(bpn)
            for quad in list(self.store.quads_for_pattern(subject, None, None, CONTROL_GRAPH)):
                self.store.remove(quad)
            for quad in list(self.store.quads_for_pattern(live_graph(bpn), None, None, PUBLIC_GRAPH)):
                self.store.remove(quad)
            self._publish_snapshot()

    def is_stale(self, status: CrawlStatus, now: datetime | None = None) -> bool:
        success = parse_time(status.last_success_at)
        if not success:
            return True
        return ((now or datetime.now(UTC)) - success).total_seconds() > self.stale_after_seconds

    def _records(self) -> list[tuple[DatasetRecord, CrawlStatus]]:
        statuses = {item.participant.bpn: item for item in self.statuses() if item.active}
        results: list[tuple[DatasetRecord, CrawlStatus]] = []
        with self.lock:
            for bpn, status in statuses.items():
                for quad in self.store.quads_for_pattern(None, RECORD_PREDICATE, None, metadata_graph(bpn)):
                    if isinstance(quad.object, Literal):
                        results.append((DatasetRecord.from_storage_dict(json.loads(quad.object.value)), status))
        return results

    def search(
        self,
        *,
        query: str | None,
        participant_bpn: str | None,
        theme: str | None,
        content_type: str | None,
        offset: int,
        limit: int,
    ) -> dict[str, Any]:
        needle = (query or "").casefold()

        def matches(item: DatasetRecord) -> bool:
            if participant_bpn and item.participant.bpn != participant_bpn:
                return False
            if theme and theme.casefold() not in {value.casefold() for value in item.themes}:
                return False
            if content_type and content_type.casefold() not in {value.casefold() for value in item.content_types}:
                return False
            haystack = item.title + item.description + item.abstract + item.keywords + item.themes
            return not needle or any(needle in value.casefold() for value in haystack)

        values = [(record, status) for record, status in self._records() if matches(record)]
        values.sort(key=lambda item: ((item[0].title[0] if item[0].title else "").casefold(), item[0].entry_id))
        page = values[offset : offset + limit]
        return {
            "items": [
                record.to_dict(stale=self.is_stale(status), participant=status.participant) for record, status in page
            ],
            "total": len(values),
            "offset": offset,
            "limit": limit,
        }

    def get_dataset(self, entry_id: str) -> dict[str, Any] | None:
        subject = entry_node(entry_id)
        statuses = {item.participant.bpn: item for item in self.statuses() if item.active}
        with self.lock:
            for bpn, status in statuses.items():
                for quad in self.store.quads_for_pattern(subject, RECORD_PREDICATE, None, metadata_graph(bpn)):
                    if isinstance(quad.object, Literal):
                        return DatasetRecord.from_storage_dict(json.loads(quad.object.value)).to_dict(
                            stale=self.is_stale(status), participant=status.participant
                        )
        return None

    def query(
        self,
        query: str,
        accept: str,
        max_results: int,
        max_bytes: int,
        *,
        timeout_seconds: float = 30,
    ) -> tuple[bytes, str]:
        """Evaluate user SPARQL in a killable child process."""
        with self.lock:
            active = [live_graph(status.participant.bpn).value for status in self.statuses() if status.active]
        with self.snapshots.acquire() as snapshot:
            return run_query(
                snapshot_path=str(snapshot),
                query=query,
                default_graphs=active,
                named_graphs=[*active, PUBLIC_GRAPH.value],
                accept=accept,
                max_results=max_results,
                max_bytes=max_bytes,
                timeout_seconds=timeout_seconds,
            )


_SNAPSHOT_NAME = re.compile(r"\d+-\d+")


class QuerySnapshots:
    """Frozen checkpoints of the store that query processes may open read-only.

    Oxigraph forbids opening a database read-only while another process writes
    it, so each published state is a separate RocksDB checkpoint (hard links,
    cheap). A checkpoint is removed once it is neither current nor in use.
    """

    def __init__(self, root: str) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        # Checkpoints from a previous process are never reused.
        self._remove([path for path in self.root.iterdir() if _SNAPSHOT_NAME.fullmatch(path.name)])
        self.lock = threading.Lock()
        self.counter = itertools.count()
        self.current: Path | None = None
        self.references: dict[Path, int] = {}

    def publish(self, store: Store) -> None:
        target = self.root / f"{time.time_ns()}-{next(self.counter)}"
        store.backup(str(target))
        with self.lock:
            self.current = target
            self.references.setdefault(target, 0)
            stale = self._unused()
        self._remove(stale)

    @contextmanager
    def acquire(self) -> Iterator[Path]:
        with self.lock:
            if self.current is None:
                raise RuntimeError("No query snapshot has been published")
            snapshot = self.current
            self.references[snapshot] += 1
        try:
            yield snapshot
        finally:
            with self.lock:
                self.references[snapshot] -= 1
                stale = self._unused()
            self._remove(stale)

    def _unused(self) -> list[Path]:
        stale = [path for path, count in self.references.items() if count == 0 and path != self.current]
        for path in stale:
            del self.references[path]
        return stale

    @staticmethod
    def _remove(paths: list[Path]) -> None:
        for path in paths:
            shutil.rmtree(path, ignore_errors=True)


_DANGEROUS = re.compile(r"\b(SERVICE|INSERT|DELETE|LOAD|CLEAR|CREATE|DROP|COPY|MOVE|ADD|WITH)\b", re.I)
_FORM = re.compile(r"\b(SELECT|ASK|CONSTRUCT|DESCRIBE)\b", re.I)
_LIMIT = re.compile(r"\bLIMIT\s+(\d+)\b", re.I)


def validate_query(query: str, max_results: int) -> str:
    scrubbed = _scrub_literals_iris_comments(query)
    if _DANGEROUS.search(scrubbed):
        raise ValueError("SPARQL updates and SERVICE clauses are not allowed")
    form = _FORM.search(scrubbed)
    if not form:
        raise ValueError("Only SELECT, ASK, CONSTRUCT, and DESCRIBE queries are allowed")
    if form.group(1).upper() != "ASK":
        limits = list(_LIMIT.finditer(scrubbed))
        last_close = scrubbed.rfind("}")
        if not limits or limits[-1].start() < last_close:
            raise ValueError("An outer LIMIT clause is required")
        if int(limits[-1].group(1)) > max_results:
            raise ValueError(f"LIMIT must not exceed {max_results}")
    return form.group(1).upper()


def _scrub_literals_iris_comments(value: str) -> str:
    result = list(value)
    index = 0
    while index < len(result):
        char = result[index]
        if char == "#":
            while index < len(result) and result[index] not in "\r\n":
                result[index] = " "
                index += 1
            continue
        if char == "<":
            result[index] = " "
            index += 1
            while index < len(result):
                next_char = result[index]
                result[index] = " "
                index += 1
                if next_char == ">":
                    break
            continue
        if char in {'"', "'"}:
            quote = char
            triple = "".join(result[index : index + 3]) == quote * 3
            count = 3 if triple else 1
            for _ in range(count):
                result[index] = " "
                index += 1
            while index < len(result):
                if result[index] == "\\":
                    result[index] = " "
                    index += 1
                    if index < len(result):
                        result[index] = " "
                        index += 1
                    continue
                if triple and "".join(result[index : index + 3]) == quote * 3:
                    for _ in range(3):
                        result[index] = " "
                        index += 1
                    break
                if not triple and result[index] == quote:
                    result[index] = " "
                    index += 1
                    break
                result[index] = " "
                index += 1
            continue
        index += 1
    return "".join(result)
