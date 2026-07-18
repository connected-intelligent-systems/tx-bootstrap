# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS builder
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir uv==0.8.6 \
    && uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev

FROM python:3.12-slim AS runtime
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --create-home app
WORKDIR /app
ENV PATH=/app/.venv/bin:$PATH \
    FEDERATED_CATALOG_STORE_PATH=/data/oxigraph \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
COPY --from=builder --chown=app:app /app/.venv /app/.venv
COPY --from=builder --chown=app:app /app/src /app/src
RUN mkdir -p /data && chown app:app /data
USER app
EXPOSE 8000
CMD ["uvicorn", "federated_catalog.app:app", "--app-dir", "src", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
