from __future__ import annotations

import asyncio
import secrets
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import parse_qs

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse

from .config import Settings
from .crawler import CatalogCrawler
from .store import CatalogStore, validate_query


def create_app(
    settings: Settings | None = None,
    store: CatalogStore | None = None,
    crawler: CatalogCrawler | None = None,
) -> FastAPI:
    configured = settings or Settings()
    catalog_store = store or CatalogStore(configured.store_path, configured.crawl_interval_seconds * 2)
    catalog_crawler = crawler or CatalogCrawler(configured, catalog_store)
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="sparql")
    query_busy = asyncio.Lock()
    crawler_task: asyncio.Task[None] | None = None

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        nonlocal crawler_task
        crawler_task = asyncio.create_task(catalog_crawler.run())
        yield
        await catalog_crawler.close()
        if crawler_task:
            await crawler_task
        executor.shutdown(wait=False, cancel_futures=True)

    app = FastAPI(title="tx-bootstrap Federated Catalog", version="1.0.0", lifespan=lifespan)
    app.state.settings = configured
    app.state.store = catalog_store
    app.state.crawler = catalog_crawler

    async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
        if not configured.api_key or x_api_key is None or not secrets.compare_digest(x_api_key, configured.api_key):
            raise HTTPException(status_code=401, detail="Unauthorized")

    @app.get("/health/live")
    async def live() -> JSONResponse:
        try:
            catalog_store.check_health()
            return JSONResponse({"status": "ok"})
        except Exception:
            return JSONResponse({"status": "unhealthy"}, status_code=503)

    @app.get("/health/ready")
    async def ready() -> JSONResponse:
        is_ready = catalog_store.has_snapshot() or catalog_crawler.ready.is_set()
        return JSONResponse({"status": "ready" if is_ready else "starting"}, status_code=200 if is_ready else 503)

    @app.get("/v1/datasets", dependencies=[Depends(require_api_key)])
    async def datasets(
        q: str | None = Query(default=None, max_length=200),
        participant_bpn: str | None = Query(default=None, alias="participantBpn"),
        theme: str | None = None,
        content_type: str | None = Query(default=None, alias="contentType"),
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=20, ge=1, le=100),
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            catalog_store.search,
            query=q,
            participant_bpn=participant_bpn,
            theme=theme,
            content_type=content_type,
            offset=offset,
            limit=limit,
        )

    @app.get("/v1/datasets/{entry_id}", dependencies=[Depends(require_api_key)])
    async def dataset(entry_id: str) -> dict[str, Any]:
        value = await asyncio.to_thread(catalog_store.get_dataset, entry_id)
        if value is None:
            raise HTTPException(status_code=404, detail="Dataset not found")
        return value

    @app.get("/v1/participants", dependencies=[Depends(require_api_key)])
    async def participants() -> dict[str, Any]:
        statuses = await asyncio.to_thread(catalog_store.statuses)
        return {"items": [{**status.to_dict(), "stale": catalog_store.is_stale(status)} for status in statuses]}

    @app.api_route("/v1/sparql", methods=["GET", "POST"], dependencies=[Depends(require_api_key)])
    async def sparql(request: Request) -> Response:
        query = request.query_params.get("query")
        if request.method == "POST":
            body = await request.body()
            content_type = request.headers.get("content-type", "").split(";", 1)[0].strip()
            if content_type == "application/sparql-query":
                query = body.decode()
            elif content_type == "application/x-www-form-urlencoded":
                query = parse_qs(body.decode()).get("query", [query])[0]
            else:
                raise HTTPException(status_code=415, detail="Use application/sparql-query or form-encoded query")
        if not query:
            raise HTTPException(status_code=400, detail="Missing SPARQL query")
        if len(query.encode()) > configured.sparql_max_query_bytes:
            raise HTTPException(status_code=413, detail="SPARQL query exceeds configured size limit")
        try:
            validate_query(query, configured.sparql_max_results)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        if query_busy.locked():
            raise HTTPException(status_code=503, detail="Another SPARQL query is still running")
        await query_busy.acquire()
        loop = asyncio.get_running_loop()
        future = loop.run_in_executor(
            executor,
            catalog_store.query,
            query,
            request.headers.get("accept", "application/sparql-results+json"),
            configured.sparql_max_results,
            configured.sparql_max_response_bytes,
        )

        def release(_future: object) -> None:
            loop.call_soon_threadsafe(query_busy.release)

        future.add_done_callback(release)
        try:
            payload, media_type = await asyncio.wait_for(
                asyncio.shield(future), timeout=configured.sparql_timeout_seconds
            )
        except TimeoutError as error:
            raise HTTPException(status_code=504, detail="SPARQL query timed out") from error
        except (SyntaxError, ValueError, OSError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return Response(payload, media_type=media_type)

    return app


app = create_app()
