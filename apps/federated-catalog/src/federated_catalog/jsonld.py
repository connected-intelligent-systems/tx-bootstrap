from __future__ import annotations

import ipaddress
import json
import socket
import threading
from collections.abc import Callable
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from pyld import jsonld  # type: ignore[import-untyped]

OUTPUT_CONTEXT: dict[str, Any] = {
    "@vocab": "https://w3id.org/edc/v0.0.1/ns/",
    "edc": "https://w3id.org/edc/v0.0.1/ns/",
    "dct": "http://purl.org/dc/terms/",
    "dcat": "http://www.w3.org/ns/dcat#",
    "odrl": "http://www.w3.org/ns/odrl/2/",
    "dspace": "https://w3id.org/dspace/v0.8/",
    "prov": "http://www.w3.org/ns/prov#",
    "schema": "http://schema.org/",
    "aas": "https://admin-shell.io/aas/3/0/",
}

ODRL_CONTEXT: dict[str, Any] = {
    "@context": {
        "@vocab": "http://www.w3.org/ns/odrl/2/",
        "odrl": "http://www.w3.org/ns/odrl/2/",
        "uid": "@id",
        "profile": {"@type": "@id"},
        "target": {"@type": "@id"},
        "assigner": {"@type": "@id"},
        "assignee": {"@type": "@id"},
        "action": {"@type": "@vocab"},
        "leftOperand": {"@type": "@vocab"},
        "operator": {"@type": "@vocab"},
    }
}

BUNDLED_CONTEXTS: dict[str, dict[str, Any]] = {
    "http://www.w3.org/ns/odrl.jsonld": ODRL_CONTEXT,
    "https://www.w3.org/ns/odrl.jsonld": ODRL_CONTEXT,
}

DCAT_DATASET = "http://www.w3.org/ns/dcat#dataset"


class SecureDocumentLoader:
    def __init__(self, timeout_seconds: int, max_bytes: int) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_bytes = max_bytes
        self.cache: dict[str, dict[str, Any]] = {}
        self.lock = threading.RLock()

    def __call__(self, url: str, _options: dict[str, Any] | None = None) -> dict[str, Any]:
        with self.lock:
            if url in self.cache:
                return self.cache[url]
            if url in BUNDLED_CONTEXTS:
                return {
                    "contextUrl": None,
                    "documentUrl": url,
                    "document": BUNDLED_CONTEXTS[url],
                    "contentType": "application/ld+json",
                }
            current = url
            with httpx.Client(timeout=self.timeout_seconds, follow_redirects=False) as client:
                for _ in range(6):
                    self._validate_url(current)
                    with client.stream(
                        "GET", current, headers={"Accept": "application/ld+json, application/json"}
                    ) as response:
                        if response.is_redirect:
                            location = response.headers.get("location")
                            if not location:
                                raise _document_error("JSON-LD context redirect has no location")
                            current = urljoin(current, location)
                            continue
                        response.raise_for_status()
                        content = bytearray()
                        for chunk in response.iter_bytes():
                            content.extend(chunk)
                            if len(content) > self.max_bytes:
                                raise _document_error("JSON-LD context exceeds configured size limit")
                        document = json.loads(content)
                        result = {
                            "contextUrl": None,
                            "documentUrl": str(response.url),
                            "document": document,
                            "contentType": response.headers.get("content-type", "application/ld+json"),
                        }
                        self.cache[url] = result
                        return result
            raise _document_error("Too many JSON-LD context redirects")

    @staticmethod
    def _validate_url(url: str) -> None:
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname:
            raise _document_error("Remote JSON-LD context URL must use HTTPS")
        try:
            addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
        except OSError as error:
            raise _document_error("Unable to resolve JSON-LD context host") from error
        for address in addresses:
            ip = ipaddress.ip_address(address[4][0])
            if not ip.is_global:
                raise _document_error("JSON-LD context resolved to a non-public address")


def _document_error(message: str) -> jsonld.JsonLdError:
    return jsonld.JsonLdError(message, "jsonld.LoadDocumentError", code="loading document failed")


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def extract_datasets(catalog: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("dcat:dataset", DCAT_DATASET, "dataset"):
        value = catalog.get(key)
        if value is not None:
            return [item for item in _as_list(value) if isinstance(item, dict)]
    graph = catalog.get("@graph")
    if isinstance(graph, list):
        datasets: list[dict[str, Any]] = []
        for node in graph:
            if isinstance(node, dict):
                datasets.extend(extract_datasets(node))
        return datasets
    return []


def prepare_dataset(
    dataset: dict[str, Any],
    catalog_context: Any,
    base_iri: str,
    document_loader: Callable[..., dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    source = dict(dataset)
    if "@context" not in source and catalog_context is not None:
        source["@context"] = catalog_context
    options = {"base": base_iri, "documentLoader": document_loader}
    expanded = jsonld.expand(source, options=options)
    compacted = jsonld.compact(expanded, OUTPUT_CONTEXT, options={**options, "compactArrays": True})
    return compacted, expanded


def rdf_nquads(expanded: list[dict[str, Any]], base_iri: str) -> str:
    value = jsonld.to_rdf(expanded, options={"base": base_iri, "format": "application/n-quads"})
    if not isinstance(value, str):
        raise ValueError("JSON-LD processor did not produce N-Quads")
    return value


def json_strings(value: Any) -> list[str]:
    result: list[str] = []
    for item in _as_list(value):
        if isinstance(item, str):
            result.append(item)
        elif isinstance(item, dict):
            candidate = item.get("@value") or item.get("@id") or item.get("dct:title")
            if isinstance(candidate, str):
                result.append(candidate)
    return result


def compact_json(value: dict[str, Any]) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False, sort_keys=True)
