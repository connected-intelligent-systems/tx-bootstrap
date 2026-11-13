#!/bin/sh
set -eu

log() {
    printf '%s\n' "$*"
}

fail() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

wait_for_http() {
    name="$1"
    url="$2"
    attempts="${3:-90}"
    i=0

    printf 'Waiting for %s' "$name"
    while [ "$i" -lt "$attempts" ]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            printf ' OK\n'
            return 0
        fi
        i=$((i + 1))
        sleep 2
        printf '.'
    done
    printf ' TIMEOUT\n'
    return 1
}

vault_get() {
    vault_addr="$1"
    key="$2"

    for path in "data/${key}" "data/data/${key}"; do
        response="$(curl -sf \
            -H "X-Vault-Token: ${VAULT_TOKEN}" \
            "${vault_addr}${VAULT_SECRET_PATH}/${path}" 2>/dev/null || true)"
        if [ -n "$response" ]; then
            printf '%s' "$response" | jq -er '.data.data.content'
            return 0
        fi
    done

    return 1
}

wait_vault_get() {
    vault_addr="$1"
    key="$2"
    attempts="${3:-60}"
    i=0

    while [ "$i" -lt "$attempts" ]; do
        value="$(vault_get "$vault_addr" "$key" 2>/dev/null || true)"
        if [ -n "$value" ] && [ "$value" != "null" ]; then
            printf '%s' "$value"
            return 0
        fi
        i=$((i + 1))
        sleep 2
    done

    return 1
}

wait_vault_get_any() {
    vault_addr="$1"
    attempts="$2"
    shift 2
    i=0

    while [ "$i" -lt "$attempts" ]; do
        for key in "$@"; do
            value="$(vault_get "$vault_addr" "$key" 2>/dev/null || true)"
            if [ -n "$value" ] && [ "$value" != "null" ]; then
                printf '%s' "$value"
                return 0
            fi
        done
        i=$((i + 1))
        sleep 2
    done

    return 1
}

vault_put() {
    vault_addr="$1"
    key="$2"
    content="$3"

    jq -n --arg content "$content" '{data:{content:$content}}' |
        curl -sf -X POST "${vault_addr}${VAULT_SECRET_PATH}/data/${key}" \
            -H "X-Vault-Token: ${VAULT_TOKEN}" \
            -H "Content-Type: application/json" \
            -d @- >/dev/null
}

http_status_with_body() {
    method="$1"
    url="$2"
    body="${3:-}"
    tmp="$(mktemp)"

    if [ -n "$body" ]; then
        code="$(curl -s -w '%{http_code}' -o "$tmp" \
            -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -H "x-api-key: ${IDENTITYHUB_API_KEY}" \
            -d "$body" 2>/dev/null || true)"
    else
        code="$(curl -s -w '%{http_code}' -o "$tmp" \
            -X "$method" "$url" \
            -H "x-api-key: ${IDENTITYHUB_API_KEY}" 2>/dev/null || true)"
    fi

    response_body="$(cat "$tmp")"
    rm -f "$tmp"
    printf '%s\n%s' "$code" "$response_body"
}

PARTICIPANT_ROLE="${PARTICIPANT_ROLE:-participant}"
PARTICIPANT_BPN="${PARTICIPANT_BPN:-BPNL00000003AYRE}"
IDENTITYHUB_CONTEXT_ID="${IDENTITYHUB_PARTICIPANT_CONTEXT_ID:-$PARTICIPANT_BPN}"
PARTICIPANT_DID_HOST="${PARTICIPANT_DID_HOST:-participant.external.test}"
PARTICIPANT_PUBLIC_HOST="${PARTICIPANT_PUBLIC_HOST:-$PARTICIPANT_DID_HOST}"
PARTICIPANT_DID="did:web:${PARTICIPANT_DID_HOST}:${PARTICIPANT_BPN}"
PARTICIPANT_KEY_ALIAS="${PARTICIPANT_BPN}-key-1"

IDENTITYHUB_IDENTITY_URL="${IDENTITYHUB_IDENTITY_URL:-http://identityhub:8082/api/identity}"
IDENTITYHUB_HEALTH_URL="${IDENTITYHUB_HEALTH_URL:-http://identityhub:8081/api/check/startup}"
IDENTITYHUB_SUPERUSER_API_KEY_ALIAS="${IDENTITYHUB_SUPERUSER_API_KEY_ALIAS:-super-user-apikey}"
VAULT_ADDR="${VAULT_ADDR:-http://vault:8200}"
VAULT_SECRET_PATH="${VAULT_SECRET_PATH:-/v1/secret}"
VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN_ID:-${VAULT_TOKEN:-root}}"

PUBLIC_DSP_CALLBACK_ADDRESS="${PUBLIC_DSP_CALLBACK_ADDRESS:-https://${PARTICIPANT_PUBLIC_HOST}/api/v1/dsp}"
PUBLIC_CREDENTIAL_SERVICE_ENDPOINT="${PUBLIC_CREDENTIAL_SERVICE_ENDPOINT:-https://${PARTICIPANT_PUBLIC_HOST}/api/credentials/v1/participants/${IDENTITYHUB_CONTEXT_ID}}"

wait_for_http "IdentityHub" "$IDENTITYHUB_HEALTH_URL"

if [ -z "${IDENTITYHUB_API_KEY:-}" ]; then
    IDENTITYHUB_API_KEY="$(wait_vault_get_any \
        "$VAULT_ADDR" 60 \
        "$IDENTITYHUB_SUPERUSER_API_KEY_ALIAS" \
        super-user-apikey)" ||
        fail "IdentityHub super-user API key unavailable in Vault"
fi

manifest="$(jq -n \
    --arg did "$PARTICIPANT_DID" \
    --arg bpn "$PARTICIPANT_BPN" \
    --arg contextId "$IDENTITYHUB_CONTEXT_ID" \
    --arg keyAlias "$PARTICIPANT_KEY_ALIAS" \
    --arg credentialEndpoint "$PUBLIC_CREDENTIAL_SERVICE_ENDPOINT" \
    --arg credentialId "${PARTICIPANT_ROLE}-credentialservice" \
    --arg dspEndpoint "$PUBLIC_DSP_CALLBACK_ADDRESS" \
    --arg dspId "${PARTICIPANT_ROLE}-dsp" \
    '{
        roles: [],
        serviceEndpoints: [
            {
                type: "CredentialService",
                serviceEndpoint: $credentialEndpoint,
                id: $credentialId
            },
            {
                type: "ProtocolEndpoint",
                serviceEndpoint: $dspEndpoint,
                id: $dspId
            }
        ],
        active: true,
        participantContextId: $contextId,
        participantId: $bpn,
        did: $did,
        key: {
            keyId: ($did + "#key-1"),
            privateKeyAlias: $keyAlias,
            keyGeneratorParams: {algorithm: "EdDSA"}
        }
    }')"

# IdentityHub 0.4 (EDC 0.17) takes the context ID unencoded in URLs.
IDENTITYHUB_CONTEXT_URL="${IDENTITYHUB_IDENTITY_URL}/v1alpha/participants/${IDENTITYHUB_CONTEXT_ID}"
DID_DOCUMENT_ATTEMPTS="${DID_DOCUMENT_ATTEMPTS:-3}"
DID_DOCUMENT_WAIT_SECONDS="${DID_DOCUMENT_WAIT_SECONDS:-15}"

create_participant_context() {
    log "Creating IdentityHub participant context ${IDENTITYHUB_CONTEXT_ID}"
    # Readiness (port 8081) can report healthy before the identity API has
    # registered its routes; until then Jetty answers 404/405. Retry briefly.
    route_attempt=0
    while :; do
        result="$(http_status_with_body POST "${IDENTITYHUB_IDENTITY_URL}/v1alpha/participants/" "$manifest")"
        status="$(printf '%s' "$result" | sed -n '1p')"
        body="$(printf '%s' "$result" | sed '1d')"
        case "$status" in
            000|404|405|502|503) ;;
            *) break ;;
        esac
        route_attempt=$((route_attempt + 1))
        [ "$route_attempt" -lt 30 ] || break
        sleep 2
    done
    case "$status" in
        200|201|204) log "IdentityHub participant context created" ;;
        409) log "IdentityHub participant context already exists" ;;
        *) printf '%s\n' "$body" >&2; fail "participant context creation failed with HTTP ${status}" ;;
    esac
}

# IdentityHub can publish the DID document without the participant's key when
# the key pair and DID resource are written concurrently under load. Other
# participants then cannot verify its tokens, so wait for the published
# document to list the key.
did_document_ready() {
    key_id="${PARTICIPANT_DID}#key-1"
    deadline=$(($(date +%s) + DID_DOCUMENT_WAIT_SECONDS))
    while [ "$(date +%s)" -lt "$deadline" ]; do
        result="$(http_status_with_body POST "${IDENTITYHUB_CONTEXT_URL}/dids/query" '{}')"
        if [ "$(printf '%s' "$result" | sed -n '1p')" = "200" ] &&
            printf '%s' "$result" | sed '1d' | jq -e \
                --arg did "$PARTICIPANT_DID" --arg key "$key_id" \
                'any(.[]; .id == $did and any(.verificationMethod[]?; .id == $key))' \
                >/dev/null 2>&1; then
            result="$(http_status_with_body POST "${IDENTITYHUB_CONTEXT_URL}/dids/state" \
                "$(jq -nc --arg did "$PARTICIPANT_DID" '{did: $did}')")"
            if printf '%s' "$result" | sed '1d' | grep -q PUBLISHED; then
                return 0
            fi
        fi
        sleep 1
    done
    return 1
}

attempt=1
while :; do
    create_participant_context
    if did_document_ready; then
        log "DID document published with key ${PARTICIPANT_DID}#key-1"
        break
    fi
    [ "$attempt" -lt "$DID_DOCUMENT_ATTEMPTS" ] ||
        fail "DID document for ${PARTICIPANT_DID} is not published with its key after ${attempt} attempts"
    # Without a verification method no token of this participant can be
    # verified, so the context cannot hold credentials yet; recreate it.
    log "DID document lacks the participant key; recreating participant context (attempt $((attempt + 1)) of ${DID_DOCUMENT_ATTEMPTS})"
    result="$(http_status_with_body DELETE "$IDENTITYHUB_CONTEXT_URL")"
    case "$(printf '%s' "$result" | sed -n '1p')" in
        200|204|404) ;;
        *) fail "participant context deletion failed with HTTP $(printf '%s' "$result" | sed -n '1p')" ;;
    esac
    attempt=$((attempt + 1))
done

# An existing context keeps the service endpoints it was created with, which
# go stale when the public host changes or after upgrading from IdentityHub
# 0.3 (base64-encoded context IDs in URLs). Replace any that differ.
reconcile_service_endpoints() {
    result="$(http_status_with_body POST "${IDENTITYHUB_CONTEXT_URL}/dids/query" '{}')"
    [ "$(printf '%s' "$result" | sed -n '1p')" = "200" ] ||
        fail "DID document query failed with HTTP $(printf '%s' "$result" | sed -n '1p')"
    published="$(printf '%s' "$result" | sed '1d' | jq -c --arg did "$PARTICIPANT_DID" \
        '[.[] | select(.id == $did) | .service[]?]')"
    did_path="$(printf '%s' "$PARTICIPANT_DID" | base64 | tr -d '\n=' | tr '+/' '-_')"
    printf '%s' "$manifest" | jq -c '.serviceEndpoints[]' | while IFS= read -r wanted; do
        id="$(printf '%s' "$wanted" | jq -r .id)"
        current="$(printf '%s' "$published" | jq -c --arg id "$id" \
            '[.[] | select(.id == $id) | {id, type, serviceEndpoint}]')"
        [ "$current" = "[$(printf '%s' "$wanted" | jq -c '{id, type, serviceEndpoint}')]" ] && continue
        log "Updating DID service endpoint ${id}"
        if [ "$current" != "[]" ]; then
            status="$(http_status_with_body DELETE \
                "${IDENTITYHUB_CONTEXT_URL}/dids/${did_path}/endpoints?serviceId=$(printf '%s' "$id" | jq -sRr @uri)" | sed -n '1p')"
            case "$status" in
                200|204) ;;
                *) fail "DID service endpoint ${id} removal failed with HTTP ${status}" ;;
            esac
        fi
        status="$(http_status_with_body POST \
            "${IDENTITYHUB_CONTEXT_URL}/dids/${did_path}/endpoints?autoPublish=true" "$wanted" | sed -n '1p')"
        case "$status" in
            200|204) ;;
            *) fail "DID service endpoint ${id} update failed with HTTP ${status}" ;;
        esac
    done || exit 1
}
reconcile_service_endpoints

log "IdentityHub participant context requested as active"

log "Preparing participant STS and token signer secrets"
sts_secret="$(wait_vault_get_any \
    "$VAULT_ADDR" 60 \
    "${IDENTITYHUB_CONTEXT_ID}-sts-client-secret" \
    "${PARTICIPANT_BPN}-sts-client-secret")" ||
    fail "STS client secret unavailable in Vault"
participant_key="$(wait_vault_get_any \
    "$VAULT_ADDR" 60 \
    "$PARTICIPANT_KEY_ALIAS" \
    "${IDENTITYHUB_CONTEXT_ID}-key-1" \
    "${PARTICIPANT_BPN}-key-1")" ||
    fail "participant key ${PARTICIPANT_KEY_ALIAS} unavailable in Vault"

vault_put "$VAULT_ADDR" sts-oauth-client-secret "$sts_secret"
vault_put "$VAULT_ADDR" token-signer-key "$participant_key"
if [ -n "${PARTICIPANT_INIT_MARKER_ALIAS:-}" ]; then
    vault_put "$VAULT_ADDR" "$PARTICIPANT_INIT_MARKER_ALIAS" complete
    log "Participant init marker ${PARTICIPANT_INIT_MARKER_ALIAS} written"
fi
log "Participant init complete"
