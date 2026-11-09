#!/usr/bin/env bash
# Rewrites the required repository-image settings in Compose files, e.g.
#   ${OPERATOR_CONSOLE_IMAGE:?...}  ->  ${OPERATOR_CONSOLE_IMAGE:-<registry>/tx-bootstrap-operator-console:<tag>}
# so a published artifact runs without image settings. Compose checks
# required variables before it applies the digest overrides that
# `publish --resolve-image-digests` adds, so the source manifests' required
# form would make those overrides unreachable. Settings still override the
# defaults. Edits the files in place; run it on a CI checkout only.
#
# Usage: compose-image-defaults.sh <registry> <tag> <compose file>...
set -euo pipefail

[ "$#" -ge 3 ] || { echo "Usage: $0 <registry> <tag> <compose file>..." >&2; exit 2; }
registry="$1"
tag="$2"
shift 2

images=(
    OPERATOR_CONSOLE_IMAGE=tx-bootstrap-operator-console
    OPERATOR_ONBOARDING_SERVICE_IMAGE=tx-bootstrap-operator-onboarding-service
    PARTICIPANT_INIT_IMAGE=tx-bootstrap-participant-init
    PARTICIPANT_PORTAL_BACKEND_IMAGE=tx-bootstrap-participant-portal-backend
    FEDERATED_CATALOG_IMAGE=tx-bootstrap-federated-catalog
)

for file in "$@"; do
    for entry in "${images[@]}"; do
        name="${entry%%=*}"
        image="${registry}/${entry#*=}:${tag}"
        # Matches the required form and an earlier default, so it can run
        # once per published tag.
        sed -E -i.bak "s|\\\$\\{${name}:[?-][^}]*\\}|\\\${${name}:-${image}}|g" "$file"
        rm -f "$file.bak"
    done
    if grep -nE '\$\{[A-Z_]+_IMAGE:\?' "$file"; then
        echo "Unhandled required image setting in $file" >&2
        exit 1
    fi
done
