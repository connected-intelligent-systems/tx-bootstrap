#!/bin/bash
set -euo pipefail

# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_commands docker

docker build \
    --tag tx-bootstrap-operator-console:local \
    --file "$ROOT/apps/operator-console/Dockerfile" \
    "$ROOT"

docker build \
    --tag tx-bootstrap-operator-onboarding-service:local \
    --file "$ROOT/apps/operator-onboarding-service/Dockerfile" \
    "$ROOT"

docker build \
    --tag tx-bootstrap-participant-init:local \
    --file "$ROOT/apps/participant-init/Dockerfile" \
    "$ROOT/apps/participant-init"

docker build \
    --tag tx-bootstrap-participant-portal-backend:local \
    --file "$ROOT/apps/participant-portal/Dockerfile" \
    "$ROOT"

docker build \
    --tag tx-bootstrap-federated-catalog:local \
    --file "$ROOT/apps/federated-catalog/Dockerfile" \
    "$ROOT/apps/federated-catalog"

echo "Local Kubernetes application images are built."
