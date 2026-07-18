from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import re
import threading
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pyoxigraph import (
    BlankNode,
    DefaultGraph,
    Literal,
    NamedNode,
    Quad,
    QueryBoolean,
    QuerySolutions,
    QueryTriples,
    RdfFormat,
    Store,
    parse,
    serialize,
)

from .models import CrawlStatus, DatasetRecord, parse_time, utc_now

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


def stable_entry_id(bpn: str, dataset_id: str) -> str:
    return hashlib.sha256(f"{bpn}\0{dataset_id}".encode()).hexdigest()


class CatalogStore:
    def __init__(self, path: str, stale_after_seconds: int) -> None:
        Path(path).mkdir(parents=True, exist_ok=True)
        self.store = Store(path)
        self.stale_after_seconds = stale_after_seconds
        self.lock = threading.RLock()
        self.cleanup_staging_graphs()

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
        subject = status_node(status.participant.bpn)
        payload = Literal(json.dumps(status.to_dict(), separators=(",", ":"), ensure_ascii=False))
        with self.lock:
            existing = list(self.store.quads_for_pattern(subject, None, None, CONTROL_GRAPH))
            for quad in existing:
                self.store.remove(quad)
            self.store.add(Quad(subject, STATE_PREDICATE, payload, CONTROL_GRAPH))
            self._replace_public_participant(status)

    def _replace_public_participant(self, status: CrawlStatus) -> None:
        graph = live_graph(status.participant.bpn)
        for quad in list(self.store.quads_for_pattern(graph, None, None, PUBLIC_GRAPH)):
            self.store.remove(quad)
        if not status.active:
            return
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
        for predicate, value in values.items():
            self.store.add(Quad(graph, predicate, value, PUBLIC_GRAPH))

    def replace_catalog(
        self,
        status: CrawlStatus,
        records: list[DatasetRecord],
        rdf_documents: Iterable[str],
    ) -> None:
        suffix = hashlib.sha256(f"{status.participant.bpn}:{utc_now().timestamp()}".encode()).hexdigest()[:16]
        staging_data = NamedNode(BASE + f"staging:data:{suffix}")
        staging_meta = NamedNode(BASE + f"staging:metadata:{suffix}")
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
                self.put_status(status)
                self.store.flush()
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

    def query(self, query: str, accept: str, max_results: int, max_bytes: int) -> tuple[bytes, str]:
        data_graphs: list[NamedNode | BlankNode | DefaultGraph] = [
            live_graph(status.participant.bpn) for status in self.statuses() if status.active
        ]
        named_graphs: list[NamedNode | BlankNode] = [
            live_graph(status.participant.bpn) for status in self.statuses() if status.active
        ]
        named_graphs.append(PUBLIC_GRAPH)
        with self.lock:
            result = self.store.query(
                query,
                default_graph=data_graphs,
                named_graphs=named_graphs,
            )
            if isinstance(result, QueryBoolean):
                payload, content_type = self._boolean_result(bool(result), accept)
            elif isinstance(result, QuerySolutions):
                payload, content_type = self._solution_result(result, accept, max_results)
            elif isinstance(result, QueryTriples):
                triples = []
                for index, triple in enumerate(result):
                    if index >= max_results:
                        break
                    triples.append(triple)
                rdf_format, content_type = _rdf_format(accept)
                graph_payload = serialize(triples, format=rdf_format)
                if graph_payload is None:
                    raise ValueError("SPARQL graph serialization did not produce a response")
                payload = graph_payload
            else:
                raise ValueError("Unsupported SPARQL result type")
        if len(payload) > max_bytes:
            raise ValueError("SPARQL result exceeds configured response limit")
        return payload, content_type

    @staticmethod
    def _boolean_result(value: bool, accept: str) -> tuple[bytes, str]:
        if "text/csv" in accept:
            return (b"boolean\r\ntrue\r\n" if value else b"boolean\r\nfalse\r\n"), "text/csv"
        if "text/tab-separated-values" in accept:
            return (b"?boolean\ntrue\n" if value else b"?boolean\nfalse\n"), "text/tab-separated-values"
        return json.dumps({"head": {}, "boolean": value}).encode(), "application/sparql-results+json"

    @staticmethod
    def _solution_result(result: QuerySolutions, accept: str, max_results: int) -> tuple[bytes, str]:
        variable_names = [variable.value for variable in result.variables]
        rows = []
        for index, solution in enumerate(result):
            if index >= max_results:
                break
            rows.append(solution)
        if "text/csv" in accept:
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(variable_names)
            writer.writerows([[_term_value(solution[name]) for name in variable_names] for solution in rows])
            return buffer.getvalue().encode(), "text/csv"
        if "text/tab-separated-values" in accept:
            lines = ["\t".join("?" + name for name in variable_names)]
            lines.extend(
                "\t".join(str(solution[name]) if solution[name] is not None else "" for name in variable_names)
                for solution in rows
            )
            return ("\n".join(lines) + "\n").encode(), "text/tab-separated-values"
        bindings = []
        for solution in rows:
            binding = {}
            for name in variable_names:
                term = solution[name]
                if term is not None:
                    binding[name] = _term_json(term)
            bindings.append(binding)
        return (
            json.dumps({"head": {"vars": variable_names}, "results": {"bindings": bindings}}).encode(),
            "application/sparql-results+json",
        )


def _term_value(term: Any) -> str:
    return getattr(term, "value", str(term)) if term is not None else ""


def _term_json(term: Any) -> dict[str, str]:
    class_name = type(term).__name__
    if class_name == "NamedNode":
        return {"type": "uri", "value": term.value}
    if class_name == "BlankNode":
        return {"type": "bnode", "value": term.value}
    result = {"type": "literal", "value": term.value}
    if getattr(term, "language", None):
        result["xml:lang"] = term.language
    elif getattr(term, "datatype", None):
        result["datatype"] = term.datatype.value
    return result


def _rdf_format(accept: str) -> tuple[RdfFormat, str]:
    if "application/ld+json" in accept:
        return RdfFormat.JSON_LD, "application/ld+json"
    if "application/n-triples" in accept:
        return RdfFormat.N_TRIPLES, "application/n-triples"
    return RdfFormat.TURTLE, "text/turtle"


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
