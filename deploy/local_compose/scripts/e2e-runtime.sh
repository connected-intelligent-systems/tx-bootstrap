#!/bin/bash
set -euo pipefail

BPN_PROVIDER="${BPN_PROVIDER:-BPNL00000003AYRE}"
BPN_CONSUMER="${BPN_CONSUMER:-BPNL00000003AZQP}"
PROVIDER_DID_HOST="${PROVIDER_DID_HOST:-provider-did}"
EDC_API_KEY="${EDC_API_KEY:-password}"

CONSUMER_MGMT="${CONSUMER_MGMT:-http://consumer-controlplane:8081/management}"
PROVIDER_DSP="${PROVIDER_DSP:-http://${PROVIDER_DID_HOST}/api/v1/dsp}"
PROVIDER_DID="did:web:${PROVIDER_DID_HOST}:${BPN_PROVIDER}"
OPERATOR_DIRECTORY="${OPERATOR_DIRECTORY:-http://operator-onboarding-service:3000/api/network/participants}"
CONSUMER_PORTAL="${CONSUMER_PORTAL:-http://consumer-portal}"
PROVIDER_PORTAL="${PROVIDER_PORTAL:-http://provider-portal}"
CONSUMER_API="${CONSUMER_API:-http://consumer-api}"
PORTAL_ADMIN_USERNAME="${PORTAL_ADMIN_USERNAME:-admin}"
PORTAL_ADMIN_PASSWORD="${PORTAL_ADMIN_PASSWORD:-local-admin-password}"
POLL_INTERVAL=3
POLL_TIMEOUT=120
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
PORTAL_ADMIN_AUTH=(-u "${PORTAL_ADMIN_USERNAME}:${PORTAL_ADMIN_PASSWORD}")

step() { printf "\n=== %s ===\n" "$1"; }
ok() { printf "  OK %s\n" "$1"; }
fail() { printf "  FAIL %s\n" "$1"; exit 1; }

step "Participant gateway authentication"
curl -fsS "$CONSUMER_API/api/openapi.json" > "$TMPDIR/participant_openapi.json"
jq -e '
  .info.title == "tx-bootstrap Participant API" and
  .paths["/api/management/v3/assets"].post["x-required-scope"] == "assets:write" and
  .paths["/api/federated-catalog/v1/datasets"].get["x-required-scope"] == "federated-catalog:read" and
  .paths["/api/data/{transferProcessId}/{path}"].post["x-required-scope"] == "data:proxy" and
  .paths["/api/management/v3/contractagreements"] == null
' "$TMPDIR/participant_openapi.json" >/dev/null || fail "participant OpenAPI contract is incomplete or exposes a blocked route"

anonymous_status="$(curl -s -o /dev/null -w '%{http_code}' "$CONSUMER_API/api/federated-catalog/v1/datasets?limit=1")"
[ "$anonymous_status" = "401" ] || fail "anonymous participant API request returned HTTP ${anonymous_status}, expected 401"

spoofed_status="$(curl -s -o /dev/null -w '%{http_code}' \
    -H 'Remote-User: admin' \
    -H 'X-Forwarded-User: admin' \
    "$CONSUMER_API/api/federated-catalog/v1/datasets?limit=1")"
[ "$spoofed_status" = "401" ] || fail "spoofed participant identity returned HTTP ${spoofed_status}, expected 401"

curl -fsS "${PORTAL_ADMIN_AUTH[@]}" "$CONSUMER_PORTAL/api/portal/userinfo" > "$TMPDIR/portal_user.json"
jq -e --arg user "$PORTAL_ADMIN_USERNAME" '.id == $user and .authMode == "forwarded-header" and .scopeWarning == false' \
    "$TMPDIR/portal_user.json" >/dev/null || {
    jq . "$TMPDIR/portal_user.json"
    fail "Basic authentication did not establish the expected portal administrator"
}
ok "OpenAPI is public, browser access is protected, and the API gateway rejects anonymous or spoofed identities"

step "Public participant directory"
curl -fsS "$OPERATOR_DIRECTORY" > "$TMPDIR/network_participants.json"
jq -e --arg provider "$BPN_PROVIDER" --arg consumer "$BPN_CONSUMER" '
  (.participants | length) == 2 and
  ([.participants[].bpn] | sort) == ([$provider, $consumer] | sort) and
  all(.participants[]; (keys | sort) == (["bpn", "did", "dspEndpoint", "name"] | sort))
' "$TMPDIR/network_participants.json" >/dev/null || {
    jq . "$TMPDIR/network_participants.json"
    fail "operator directory does not expose the two expected public participants"
}

curl -fsS "${PORTAL_ADMIN_AUTH[@]}" "$CONSUMER_PORTAL/api/portal/network-participants" > "$TMPDIR/consumer_network.json"
jq -e --arg provider "$BPN_PROVIDER" '
  (.participants | length) == 1 and .participants[0].bpn == $provider
' "$TMPDIR/consumer_network.json" >/dev/null || {
    jq . "$TMPDIR/consumer_network.json"
    fail "consumer portal did not discover only the provider"
}

curl -fsS "${PORTAL_ADMIN_AUTH[@]}" "$PROVIDER_PORTAL/api/portal/network-participants" > "$TMPDIR/provider_network.json"
jq -e --arg consumer "$BPN_CONSUMER" '
  (.participants | length) == 1 and .participants[0].bpn == $consumer
' "$TMPDIR/provider_network.json" >/dev/null || {
    jq . "$TMPDIR/provider_network.json"
    fail "provider portal did not discover only the consumer"
}

PROVIDER_DSP="$(jq -r '.participants[0].dspEndpoint' "$TMPDIR/consumer_network.json")"
PROVIDER_DID="$(jq -r '.participants[0].did' "$TMPDIR/consumer_network.json")"
ok "consumer automatically discovered provider ${PROVIDER_DID} at ${PROVIDER_DSP}"

step "Catalog request"
jq -n --arg dsp "$PROVIDER_DSP" --arg did "$PROVIDER_DID" '{
  "@context": {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"},
  counterPartyAddress: $dsp,
  counterPartyId: $did,
  protocol: "dataspace-protocol-http"
}' > "$TMPDIR/catalog_request.json"
curl -s -X POST "$CONSUMER_MGMT/v3/catalog/request" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: $EDC_API_KEY" \
    -d @"$TMPDIR/catalog_request.json" > "$TMPDIR/catalog.json"

if jq -e 'if type == "array" then .[0] else . end | .["@type"]' "$TMPDIR/catalog.json" 2>/dev/null | grep -qi error; then
    jq . "$TMPDIR/catalog.json"
    fail "catalog request failed"
fi
jq 'if type == "array" then .[0] else . end | if .["dcat:dataset"] | type == "array" then .["dcat:dataset"][0] else .["dcat:dataset"] end' "$TMPDIR/catalog.json" > "$TMPDIR/dataset.json"
if [ "$(jq -r 'type' "$TMPDIR/dataset.json")" = "null" ]; then
    jq . "$TMPDIR/catalog.json"
    fail "no dataset in catalog"
fi
ASSET_ID="$(jq -r '.["@id"]' "$TMPDIR/dataset.json")"
jq 'if .["odrl:hasPolicy"] | type == "array" then .["odrl:hasPolicy"][0] else .["odrl:hasPolicy"] end' \
    "$TMPDIR/dataset.json" > "$TMPDIR/offer.json"
OFFER_ID="$(jq -r '.["@id"]' "$TMPDIR/offer.json")"
ok "asset ${ASSET_ID}, offer ${OFFER_ID}"

step "Participant-local federated catalog"
ELAPSED=0
while [ "$ELAPSED" -lt "$POLL_TIMEOUT" ]; do
    curl -sG "${PORTAL_ADMIN_AUTH[@]}" "$CONSUMER_PORTAL/api/federated-catalog/v1/datasets" \
        --data-urlencode "q=Test Asset" > "$TMPDIR/federated_catalog.json"
    if jq -e --arg asset "$ASSET_ID" '.items | any(.datasetId == $asset)' "$TMPDIR/federated_catalog.json" >/dev/null 2>&1; then
        ok "cached catalog contains ${ASSET_ID}"
        break
    fi
    sleep "$POLL_INTERVAL"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done
jq -e --arg asset "$ASSET_ID" '.items | any(.datasetId == $asset)' "$TMPDIR/federated_catalog.json" >/dev/null || {
    jq . "$TMPDIR/federated_catalog.json"
    fail "federated catalog did not crawl the provider asset"
}

curl -sG "${PORTAL_ADMIN_AUTH[@]}" "$CONSUMER_PORTAL/api/federated-catalog/v1/sparql" \
    --data-urlencode 'query=SELECT ?dataset WHERE { ?dataset <https://w3id.org/edc/v0.0.1/ns/name> ?name } LIMIT 100' \
    -H 'Accept: application/sparql-results+json' > "$TMPDIR/sparql.json"
jq -e '.results.bindings | length > 0' "$TMPDIR/sparql.json" >/dev/null || {
    jq . "$TMPDIR/sparql.json"
    fail "SPARQL endpoint did not return the crawled dataset"
}
ok "bounded SPARQL query returned catalog data"

client_response="$(curl -s "${PORTAL_ADMIN_AUTH[@]}" -X POST "$CONSUMER_PORTAL/api/portal/api-clients" \
    -H 'Content-Type: application/json' \
    -d '{"name":"e2e-read-only","scopes":["federated-catalog:read","assets:read"],"expiresInDays":1}')"
client_token="$(printf '%s' "$client_response" | jq -r '.token')"
client_id="$(printf '%s' "$client_response" | jq -r '.client.id')"
[ "$client_token" != "null" ] && [ -n "$client_token" ] || {
    printf '%s\n' "$client_response"
    fail "read-only API client was not created"
}
[ "$client_id" != "null" ] && [ -n "$client_id" ] || fail "read-only API client response did not contain its id"
curl -fsS "$CONSUMER_API/api/federated-catalog/v1/datasets?limit=1" \
    -H "Authorization: Bearer $client_token" >/dev/null || fail "read-only API client cannot search the catalog"
write_status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$CONSUMER_API/api/management/v3/assets" \
    -H "Authorization: Bearer $client_token" \
    -H 'Content-Type: application/json' \
    -d '{}')"
[ "$write_status" = "403" ] || fail "read-only API client write returned HTTP ${write_status}, expected 403"
ok "scoped client can read and is denied asset writes"

rotate_response="$(curl -fsS "${PORTAL_ADMIN_AUTH[@]}" -X POST \
    "$CONSUMER_PORTAL/api/portal/api-clients/${client_id}/rotate")"
rotated_token="$(printf '%s' "$rotate_response" | jq -r '.token')"
[ "$rotated_token" != "null" ] && [ -n "$rotated_token" ] || fail "API client rotation did not return a token"
old_token_status="$(curl -s -o /dev/null -w '%{http_code}' \
    "$CONSUMER_API/api/federated-catalog/v1/datasets?limit=1" \
    -H "Authorization: Bearer $client_token")"
[ "$old_token_status" = "401" ] || fail "rotated API client old token returned HTTP ${old_token_status}, expected 401"
curl -fsS "$CONSUMER_API/api/federated-catalog/v1/datasets?limit=1" \
    -H "Authorization: Bearer $rotated_token" >/dev/null || fail "rotated API client token cannot search the catalog"
revoke_status="$(curl -s -o /dev/null -w '%{http_code}' "${PORTAL_ADMIN_AUTH[@]}" -X DELETE \
    "$CONSUMER_PORTAL/api/portal/api-clients/${client_id}")"
[ "$revoke_status" = "204" ] || fail "API client revoke returned HTTP ${revoke_status}, expected 204"
revoked_token_status="$(curl -s -o /dev/null -w '%{http_code}' \
    "$CONSUMER_API/api/federated-catalog/v1/datasets?limit=1" \
    -H "Authorization: Bearer $rotated_token")"
[ "$revoked_token_status" = "401" ] || fail "revoked API client token returned HTTP ${revoked_token_status}, expected 401"
ok "rotation invalidates the previous token and revocation invalidates the replacement"

management_bypass_status="$(curl -s -o /dev/null -w '%{http_code}' "$CONSUMER_API/management/v3/assets")"
catalog_bypass_status="$(curl -s -o /dev/null -w '%{http_code}' "$CONSUMER_API/catalog/request")"
[ "$management_bypass_status" = "404" ] || fail "direct /management bypass returned HTTP ${management_bypass_status}"
[ "$catalog_bypass_status" = "404" ] || fail "direct /catalog bypass returned HTTP ${catalog_bypass_status}"
ok "direct EDC management and catalog bypass routes are unavailable"

step "Contract negotiation"
jq --arg target "$ASSET_ID" --arg assigner "$BPN_PROVIDER" \
    '. + {"odrl:target": {"@id": $target}, "odrl:assigner": {"@id": $assigner}}' \
    "$TMPDIR/offer.json" > "$TMPDIR/negotiation_policy.json"
jq -n --slurpfile policy "$TMPDIR/negotiation_policy.json" --arg dsp "$PROVIDER_DSP" --arg did "$PROVIDER_DID" '{
  "@context": [
    "https://w3id.org/dspace/2025/1/odrl-profile.jsonld",
    "https://w3id.org/catenax/2025/9/policy/context.jsonld",
    {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"}
  ],
  "@type": "ContractRequest",
  counterPartyAddress: $dsp,
  counterPartyId: $did,
  protocol: "dataspace-protocol-http",
  policy: $policy[0]
}' > "$TMPDIR/negotiation_request.json"
curl -s -X POST "$CONSUMER_MGMT/v3/contractnegotiations" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: $EDC_API_KEY" \
    -d @"$TMPDIR/negotiation_request.json" > "$TMPDIR/negotiation_response.json"
NEGOTIATION_ID="$(jq -r '.["@id"] // .id' "$TMPDIR/negotiation_response.json")"
[ "$NEGOTIATION_ID" != "null" ] && [ -n "$NEGOTIATION_ID" ] || { jq . "$TMPDIR/negotiation_response.json"; fail "negotiation not started"; }

ELAPSED=0
while [ "$ELAPSED" -lt "$POLL_TIMEOUT" ]; do
    curl -s "$CONSUMER_MGMT/v3/contractnegotiations/$NEGOTIATION_ID" \
        -H "X-Api-Key: $EDC_API_KEY" > "$TMPDIR/negotiation_status.json"
    STATE="$(jq -r '.state // .["edc:state"]' "$TMPDIR/negotiation_status.json")"
    case "$STATE" in
        FINALIZED)
            CONTRACT_AGREEMENT_ID="$(jq -r '.contractAgreementId // .["edc:contractAgreementId"]' "$TMPDIR/negotiation_status.json")"
            ok "agreement ${CONTRACT_AGREEMENT_ID}"
            break
            ;;
        TERMINATED|ERROR)
            jq . "$TMPDIR/negotiation_status.json"
            fail "negotiation failed"
            ;;
    esac
    sleep "$POLL_INTERVAL"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done
[ "${CONTRACT_AGREEMENT_ID:-}" ] || fail "negotiation timed out"

step "Transfer process"
jq -n --arg dsp "$PROVIDER_DSP" --arg did "$PROVIDER_DID" --arg contract "$CONTRACT_AGREEMENT_ID" '{
  "@context": {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"},
  "@type": "TransferRequest",
  counterPartyAddress: $dsp,
  counterPartyId: $did,
  protocol: "dataspace-protocol-http",
  contractId: $contract,
  transferType: "HttpData-PULL"
}' > "$TMPDIR/transfer_request.json"
curl -s -X POST "$CONSUMER_MGMT/v3/transferprocesses" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: $EDC_API_KEY" \
    -d @"$TMPDIR/transfer_request.json" > "$TMPDIR/transfer_response.json"
TRANSFER_ID="$(jq -r '.["@id"] // .id' "$TMPDIR/transfer_response.json")"
[ "$TRANSFER_ID" != "null" ] && [ -n "$TRANSFER_ID" ] || { jq . "$TMPDIR/transfer_response.json"; fail "transfer not started"; }

ELAPSED=0
while [ "$ELAPSED" -lt "$POLL_TIMEOUT" ]; do
    curl -s "$CONSUMER_MGMT/v3/transferprocesses/$TRANSFER_ID" \
        -H "X-Api-Key: $EDC_API_KEY" > "$TMPDIR/transfer_status.json"
    STATE="$(jq -r '.state // .["edc:state"]' "$TMPDIR/transfer_status.json")"
    case "$STATE" in
        STARTED|COMPLETED)
            ok "transfer ${TRANSFER_ID} ${STATE}"
            break
            ;;
        TERMINATED|ERROR)
            jq . "$TMPDIR/transfer_status.json"
            fail "transfer failed"
            ;;
    esac
    sleep "$POLL_INTERVAL"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done
[ "$STATE" = "STARTED" ] || [ "$STATE" = "COMPLETED" ] || fail "transfer timed out"

step "EDR and data access"
sleep 2
curl -s "$CONSUMER_MGMT/v3/edrs/$TRANSFER_ID/dataaddress" \
    -H "X-Api-Key: $EDC_API_KEY" > "$TMPDIR/edr.json"
ENDPOINT="$(jq -r '.endpoint // .["edc:endpoint"] // .baseUrl // .["edc:baseUrl"]' "$TMPDIR/edr.json")"
REFRESH_ENDPOINT="$(jq -r '.["tx-auth:refreshEndpoint"] // .refreshEndpoint' "$TMPDIR/edr.json")"
AUTHORIZATION="$(jq -r '.authorization // .["edc:authorization"] // .authKey // .["edc:authKey"]' "$TMPDIR/edr.json")"
[ "$ENDPOINT" != "null" ] && [ -n "$ENDPOINT" ] || { jq . "$TMPDIR/edr.json"; fail "missing EDR endpoint"; }
[ "$REFRESH_ENDPOINT" = "${ENDPOINT%/}" ] || fail "EDR refresh endpoint does not match its public data endpoint"
[ "$AUTHORIZATION" != "null" ] && [ -n "$AUTHORIZATION" ] || { jq . "$TMPDIR/edr.json"; fail "missing EDR authorization"; }
curl -sL "$ENDPOINT" -H "Authorization: $AUTHORIZATION" > "$TMPDIR/data.json"
jq . "$TMPDIR/data.json" >/dev/null || { cat "$TMPDIR/data.json"; fail "data response is not JSON"; }
curl -fsS "${PORTAL_ADMIN_AUTH[@]}" "$CONSUMER_PORTAL/api/portal/transfers/$TRANSFER_ID/preview" > "$TMPDIR/data_preview.json"
jq -e '.status == 200 and .truncated == false and (.body | fromjson | true)' \
    "$TMPDIR/data_preview.json" >/dev/null || {
    jq . "$TMPDIR/data_preview.json"
    fail "participant portal data preview is invalid"
}
curl -fsS "${PORTAL_ADMIN_AUTH[@]}" \
    -D "$TMPDIR/data_download.headers" \
    -o "$TMPDIR/data_download.json" \
    "$CONSUMER_PORTAL/api/portal/transfers/$TRANSFER_ID/download"
jq . "$TMPDIR/data_download.json" >/dev/null || {
    cat "$TMPDIR/data_download.json"
    fail "participant portal data download is not JSON"
}
grep -qi '^content-disposition: attachment' "$TMPDIR/data_download.headers" || {
    cat "$TMPDIR/data_download.headers"
    fail "participant portal data download is missing an attachment disposition"
}

data_client_response="$(curl -fsS "${PORTAL_ADMIN_AUTH[@]}" -X POST \
    "$CONSUMER_PORTAL/api/portal/api-clients" \
    -H 'Content-Type: application/json' \
    -d '{"name":"e2e-data-proxy","scopes":["data:proxy"],"expiresInDays":1}')"
data_client_token="$(printf '%s' "$data_client_response" | jq -r '.token')"
[ "$data_client_token" != "null" ] && [ -n "$data_client_token" ] || {
    printf '%s\n' "$data_client_response"
    fail "data-proxy API client was not created"
}
curl -fsS "$CONSUMER_API/api/data/$TRANSFER_ID?mode=e2e-get" \
    -H "Authorization: Bearer $data_client_token" > "$TMPDIR/data_proxy_get.json"
jq -e '
  .method == "GET" and
  .url == "/data?mode=e2e-get" and
  .body == ""
' "$TMPDIR/data_proxy_get.json" >/dev/null || {
    jq . "$TMPDIR/data_proxy_get.json"
    fail "participant application data proxy did not preserve the GET request"
}
curl -fsS -X POST "$CONSUMER_API/api/data/$TRANSFER_ID/orders/42?mode=e2e" \
    -H "Authorization: Bearer $data_client_token" \
    -H 'Content-Type: application/json' \
    -d '{"status":"ready"}' > "$TMPDIR/data_proxy.json"
jq -e '
  .method == "POST" and
  .url == "/data/orders/42?mode=e2e" and
  .contentType == "application/json" and
  (.body | fromjson | .status == "ready")
' "$TMPDIR/data_proxy.json" >/dev/null || {
    jq . "$TMPDIR/data_proxy.json"
    fail "participant application data proxy did not preserve the REST request"
}
ok "valid JSON data received directly, through portal preview/download, and through the application data proxy"

printf "\nE2E complete: asset=%s agreement=%s transfer=%s\n" "$ASSET_ID" "$CONTRACT_AGREEMENT_ID" "$TRANSFER_ID"
