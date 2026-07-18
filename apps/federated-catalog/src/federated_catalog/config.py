from __future__ import annotations

import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


@dataclass(frozen=True)
class Settings:
    store_path: str = os.getenv("FEDERATED_CATALOG_STORE_PATH", "/tmp/tx-bootstrap-federated-catalog/oxigraph")
    api_key: str = os.getenv("FEDERATED_CATALOG_API_KEY", "")
    participant_bpn: str = os.getenv("PARTICIPANT_BPN", "")
    directory_url: str = os.getenv("PARTICIPANT_DIRECTORY_URL", "http://operator-onboarding-service:3000/api").rstrip(
        "/"
    )
    edc_management_url: str = os.getenv("EDC_MANAGEMENT_API_URL", "http://controlplane:8081/management").rstrip("/")
    edc_api_key: str = os.getenv("EDC_API_KEY", "")
    directory_interval_seconds: int = _int("DIRECTORY_REFRESH_INTERVAL_SECONDS", 300)
    crawl_interval_seconds: int = _int("CATALOG_REFRESH_INTERVAL_SECONDS", 900)
    crawl_concurrency: int = _int("CATALOG_CRAWL_CONCURRENCY", 4)
    page_size: int = _int("CATALOG_CRAWL_PAGE_SIZE", 100)
    request_timeout_seconds: int = _int("CATALOG_REQUEST_TIMEOUT_SECONDS", 30)
    removal_grace_seconds: int = _int("CATALOG_REMOVAL_GRACE_SECONDS", 86400)
    context_max_bytes: int = _int("JSONLD_CONTEXT_MAX_BYTES", 1_048_576)
    sparql_timeout_seconds: int = _int("SPARQL_TIMEOUT_SECONDS", 30)
    sparql_max_results: int = _int("SPARQL_MAX_RESULTS", 1000)
    sparql_max_query_bytes: int = _int("SPARQL_MAX_QUERY_BYTES", 65_536)
    sparql_max_response_bytes: int = _int("SPARQL_MAX_RESPONSE_BYTES", 5_242_880)
