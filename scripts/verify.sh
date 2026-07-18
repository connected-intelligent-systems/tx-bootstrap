#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

for command in npm uv docker helm git; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required verification command is unavailable: $command" >&2
    exit 1
  fi
done

npm run lint
npm run build
npm test

uv run --locked --project apps/federated-catalog \
  ruff check apps/federated-catalog/src apps/federated-catalog/tests
uv run --locked --project apps/federated-catalog \
  mypy apps/federated-catalog/src
uv run --locked --project apps/federated-catalog \
  pytest -q apps/federated-catalog/tests

find apps deploy scripts -type f -name '*.sh' -print0 | while IFS= read -r -d '' script; do
  bash -n "$script"
done

docker compose \
  --env-file deploy/local_compose/local.env.example \
  -f deploy/local_compose/compose.yaml \
  config --quiet

for domain in operator provider consumer; do
  docker compose \
    --env-file deploy/local_compose/local.env.example \
    -f "deploy/local_compose/$domain/compose.yaml" \
    config --quiet
done

for chart in operator participant; do
  helm lint --strict "deploy/helm/$chart"
  helm template "$chart" "deploy/helm/$chart" \
    --namespace "tx-$chart" \
    >/dev/null
done

git diff --check
