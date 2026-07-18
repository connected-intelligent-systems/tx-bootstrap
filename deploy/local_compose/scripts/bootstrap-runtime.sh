#!/bin/bash
set -euo pipefail

BPN_ISSUER="${BPN_ISSUER:-BPNL00000003CRHK}"
BPN_PROVIDER="${BPN_PROVIDER:-BPNL00000003AYRE}"
BPN_CONSUMER="${BPN_CONSUMER:-BPNL00000003AZQP}"
ISSUER_DID_HOST="${ISSUER_DID_HOST:-issuer-did}"
PROVIDER_DID_HOST="${PROVIDER_DID_HOST:-provider-did}"
CONSUMER_DID_HOST="${CONSUMER_DID_HOST:-consumer-did}"
BDRS_API_KEY="${BDRS_API_KEY:-password}"
EDC_API_KEY="${EDC_API_KEY:-password}"
PROVIDER_DEMO_ASSET_URL="${PROVIDER_DEMO_ASSET_URL:-https://jsonplaceholder.typicode.com/todos/1}"
CREDENTIAL_POLL_INTERVAL="${CREDENTIAL_POLL_INTERVAL:-3}"
CREDENTIAL_POLL_RETRIES="${CREDENTIAL_POLL_RETRIES:-30}"

DID_ISSUER="did:web:${ISSUER_DID_HOST}:${BPN_ISSUER}"
DID_PROVIDER="did:web:${PROVIDER_DID_HOST}:${BPN_PROVIDER}"
DID_CONSUMER="did:web:${CONSUMER_DID_HOST}:${BPN_CONSUMER}"

BDRS_MGMT_URL="http://bdrs-server:8081"
PROVIDER_MGMT_URL="http://provider-controlplane:8081"
PROVIDER_DSP_URL="${PROVIDER_DSP_URL:-http://${PROVIDER_DID_HOST}/api/v1/dsp}"
CONSUMER_DSP_URL="${CONSUMER_DSP_URL:-http://${CONSUMER_DID_HOST}/api/v1/dsp}"
PROVIDER_CREDENTIALS_URL="${PROVIDER_CREDENTIALS_URL:-http://${PROVIDER_DID_HOST}/api/credentials}"
CONSUMER_CREDENTIALS_URL="${CONSUMER_CREDENTIALS_URL:-http://${CONSUMER_DID_HOST}/api/credentials}"
OPERATOR_CONSOLE_API_URL="${OPERATOR_CONSOLE_API_URL:-http://operator-console:3000/api}"
OPERATOR_CONSOLE_UI_URL="${OPERATOR_CONSOLE_UI_URL:-http://operator-console:3000}"
OPERATOR_CONSOLE_API_KEY="${OPERATOR_CONSOLE_API_KEY:-}"
PROVIDER_ONBOARDING_URL="http://provider-participant-portal-backend:3000"
CONSUMER_ONBOARDING_URL="http://consumer-participant-portal-backend:3000"
OPERATOR_DIRECTORY_URL="http://operator-onboarding-service:3000/api/network/participants"
PROVIDER_PORTAL_DIRECTORY_URL="${PROVIDER_PORTAL_DIRECTORY_URL:-http://provider-portal/api/portal/network-participants}"
CONSUMER_PORTAL_DIRECTORY_URL="${CONSUMER_PORTAL_DIRECTORY_URL:-http://consumer-portal/api/portal/network-participants}"
PORTAL_ADMIN_USERNAME="${PORTAL_ADMIN_USERNAME:-admin}"
PORTAL_ADMIN_PASSWORD="${PORTAL_ADMIN_PASSWORD:-local-admin-password}"
PORTAL_ADMIN_AUTH=(-u "${PORTAL_ADMIN_USERNAME}:${PORTAL_ADMIN_PASSWORD}")

step() { printf "\n=== %s ===\n" "$1"; }
ok() { printf "  OK %s\n" "$1"; }
fail() { printf "  FAIL %s\n" "$1"; exit 1; }

OPERATOR_CONSOLE_AUTH_HEADERS=()
if [ -n "$OPERATOR_CONSOLE_API_KEY" ]; then
    OPERATOR_CONSOLE_AUTH_HEADERS=(-H "x-api-key: ${OPERATOR_CONSOLE_API_KEY}")
fi

wait_for_health() {
    local name="$1" url="$2" max_attempts="${3:-90}"
    local attempt=0
    printf "  Waiting for %s" "$name"
    while [ "$attempt" -lt "$max_attempts" ]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            printf " OK\n"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
        printf "."
    done
    printf " TIMEOUT\n"
    return 1
}


onboard_participant() {
    local label="$1" org_name="$2" bpn="$3" did="$4" dsp_endpoint="$5" credential_endpoint="$6" gateway_url="$7"
    local request_body tmp http_code response case_id business_partner_id assigned_bpn onboarded attempt

    request_body="$(jq -n \
        --arg legalName "$org_name" \
        --arg bpn "$bpn" \
        --arg did "$did" \
        --arg dspEndpoint "$dsp_endpoint" \
        --arg identityHubCredentialServiceEndpoint "$credential_endpoint" \
        --arg contactEmail "${label}@local.test" \
        '{
            legalName: $legalName,
            legalForm: "GmbH",
            registeredAddress: "Local Bootstrap Address",
            country: "DE",
            taxId: "",
            commercialRegisterNumber: "",
            website: "",
            contactEmail: $contactEmail,
            bpn: $bpn,
            did: $did,
            dspEndpoint: $dspEndpoint,
            identityHubCredentialServiceEndpoint: $identityHubCredentialServiceEndpoint,
            requestedRole: "participant"
        }')"

    tmp="$(mktemp)"
    http_code="$(curl -s -w "%{http_code}" -o "$tmp" \
        -X POST "${OPERATOR_CONSOLE_API_URL}/admin/participants" \
        -H "Content-Type: application/json" \
        "${OPERATOR_CONSOLE_AUTH_HEADERS[@]}" \
        -d "$request_body" 2>/dev/null || true)"
    response="$(cat "$tmp")"
    rm -f "$tmp"
    if [ "$http_code" != "200" ] && [ "$http_code" != "201" ]; then
        printf "%s\n" "$response"
        fail "${label} participant creation via admin API failed with HTTP ${http_code}"
    fi

    registration_token="$(printf "%s" "$response" | jq -r '.registrationToken // empty')"
    business_partner_id="$(printf "%s" "$response" | jq -r '.participant.id // .id // empty')"
    case_id="$(printf "%s" "$response" | jq -r '.participant.onboarding.id // .case.id // empty')"
    assigned_bpn="$(printf "%s" "$response" | jq -r '.participant.bpn.assignedBpn // empty')"
    [ -n "$registration_token" ] && [ "$registration_token" != "null" ] || fail "${label} onboarding case did not return registrationToken"
    [ -n "$business_partner_id" ] && [ "$business_partner_id" != "null" ] || fail "${label} onboarding case did not return businessPartnerId"
    [ "$assigned_bpn" = "$bpn" ] || fail "${label} participant creation returned unexpected BPN ${assigned_bpn:-missing}"
    ok "${label} participant created with verified BPN"

    tmp="$(mktemp)"
    http_code="$(curl -s -w "%{http_code}" -o "$tmp" \
        -X POST "${gateway_url}/api/onboarding/attach" \
        -H "Content-Type: application/json" \
        -d "$(jq -n \
            --arg registrationToken "$registration_token" \
            '{registrationToken: $registrationToken}')" 2>/dev/null || true)"
    response="$(cat "$tmp")"
    rm -f "$tmp"
    if [ "$http_code" != "200" ]; then
        printf "%s\n" "$response"
        fail "${label} portal gateway invite attach failed with HTTP ${http_code}"
    fi
    ok "${label} portal gateway attached to operator invite"


    attempt=0
    while [ "$attempt" -lt "$CREDENTIAL_POLL_RETRIES" ]; do
        tmp="$(mktemp)"
        http_code="$(curl -s -w "%{http_code}" -o "$tmp" "${gateway_url}/api/onboarding/state" 2>/dev/null || true)"
        response="$(cat "$tmp")"
        rm -f "$tmp"
        onboarded="$(printf "%s" "$response" | jq -r '.onboarded // false' 2>/dev/null || true)"
        if [ "$http_code" = "200" ] && [ "$onboarded" = "true" ]; then
            ok "${label} portal gateway finished onboarding"
            return
        fi
        attempt=$((attempt + 1))
        sleep "$CREDENTIAL_POLL_INTERVAL"
    done
    printf "%s\n" "$response"
    fail "${label} portal gateway did not finish onboarding"
}

step "Waiting for services"
wait_for_health "issuer Identity Hub" "http://issuer-identityhub:8081/api/check/readiness"
wait_for_health "provider Identity Hub" "http://provider-identityhub:8081/api/check/readiness"
wait_for_health "consumer Identity Hub" "http://consumer-identityhub:8081/api/check/readiness"
wait_for_health "BDRS" "http://bdrs-server:8080/api/check/startup"
wait_for_health "provider control plane" "http://provider-controlplane:8080/api/check/health"
wait_for_health "consumer control plane" "http://consumer-controlplane:8080/api/check/health"
wait_for_health "provider data plane" "http://provider-dataplane:8080/api/check/startup"
wait_for_health "consumer data plane" "http://consumer-dataplane:8080/api/check/startup"
wait_for_health "operator operator-console" "${OPERATOR_CONSOLE_UI_URL}"
wait_for_health "provider portal gateway" "${PROVIDER_ONBOARDING_URL}/health"
wait_for_health "consumer portal gateway" "${CONSUMER_ONBOARDING_URL}/health"


step "Registering issuer BPN-to-DID mapping in BDRS"
for entry in "${BPN_ISSUER}|${DID_ISSUER}"; do
    bpn="${entry%%|*}"
    did="${entry#*|}"
    http_code="$(curl -s -o /dev/null -w "%{http_code}" \
        -X PUT "${BDRS_MGMT_URL}/api/management/bpn-directory" \
        -H "Content-Type: application/json" \
        -H "x-api-key: ${BDRS_API_KEY}" \
        -d "{\"bpn\":\"${bpn}\",\"did\":\"${did}\"}" 2>/dev/null || true)"
    case "$http_code" in
        200|204|409) ok "${bpn} -> ${did}" ;;
        *) fail "BDRS registration failed for ${bpn} with HTTP ${http_code}" ;;
    esac
done


step "Creating provider demo asset and policies"
asset_body="$(jq -n --arg url "$PROVIDER_DEMO_ASSET_URL" '{
    "@context": {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"},
    "@id": "test-asset-1",
    properties: {
        name: "Test Asset",
        description: "Infrastructure-only E2E test dataset"
    },
    dataAddress: {
        type: "HttpData",
        baseUrl: $url
    }
}')"
http_code="$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${PROVIDER_MGMT_URL}/management/v3/assets" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ${EDC_API_KEY}" \
    -d "$asset_body" 2>/dev/null || true)"
case "$http_code" in 200|204|409) ok "provider asset ready" ;; *) fail "asset creation failed with HTTP ${http_code}" ;; esac

membership_policy='{
  "@context": [
    "https://w3id.org/dspace/2025/1/odrl-profile.jsonld",
    "https://w3id.org/catenax/2025/9/policy/context.jsonld",
    {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"}
  ],
  "@type": "PolicyDefinition",
  "@id": "membership-policy",
  "policy": {
    "@type": "Set",
    "permission": [{
      "action": "access",
      "constraint": {"leftOperand": "Membership", "operator": "eq", "rightOperand": "active"}
    }]
  }
}'
http_code="$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${PROVIDER_MGMT_URL}/management/v3/policydefinitions" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ${EDC_API_KEY}" \
    -d "$membership_policy" 2>/dev/null || true)"
case "$http_code" in 200|204|409) ok "membership policy ready" ;; *) fail "membership policy failed with HTTP ${http_code}" ;; esac

contract_policy='{
  "@context": [
    "https://w3id.org/dspace/2025/1/odrl-profile.jsonld",
    "https://w3id.org/catenax/2025/9/policy/context.jsonld",
    {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"}
  ],
  "@type": "PolicyDefinition",
  "@id": "dataexchange-policy",
  "policy": {
    "@type": "Set",
    "permission": [{
      "action": "use",
      "constraint": {
        "and": [
          {"leftOperand": "Membership", "operator": "eq", "rightOperand": "active"},
          {"leftOperand": "FrameworkAgreement", "operator": "eq", "rightOperand": "DataExchangeGovernance:1.0"},
          {"leftOperand": "UsagePurpose", "operator": "isAnyOf", "rightOperand": "cx.core.industrycore:1"}
        ]
      }
    }]
  }
}'
http_code="$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${PROVIDER_MGMT_URL}/management/v3/policydefinitions" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ${EDC_API_KEY}" \
    -d "$contract_policy" 2>/dev/null || true)"
case "$http_code" in 200|204|409) ok "contract policy ready" ;; *) fail "contract policy failed with HTTP ${http_code}" ;; esac

contract_definition='{
  "@context": {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"},
  "@id": "test-contract-def-1",
  "accessPolicyId": "membership-policy",
  "contractPolicyId": "dataexchange-policy",
  "assetsSelector": [{
    "operandLeft": "https://w3id.org/edc/v0.0.1/ns/id",
    "operator": "=",
    "operandRight": "test-asset-1"
  }]
}'
http_code="$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${PROVIDER_MGMT_URL}/management/v3/contractdefinitions" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ${EDC_API_KEY}" \
    -d "$contract_definition" 2>/dev/null || true)"
case "$http_code" in 200|204|409) ok "contract definition ready" ;; *) fail "contract definition failed with HTTP ${http_code}" ;; esac

step "Verifying DID documents"
for entry in "provider-did|${BPN_PROVIDER}" "consumer-did|${BPN_CONSUMER}"; do
    host="${entry%%|*}"
    bpn="${entry#*|}"
    did_document="$(curl -sf "http://${host}/${bpn}/did.json")"
    [ -n "$did_document" ] || fail "${host}/${bpn}/did.json returned an empty DID document"
    printf "%s" "$did_document" | jq -e '.verificationMethod | length > 0' >/dev/null
    ok "${host}/${bpn}/did.json"
done

step "Onboarding local participants through operator operator-console"
onboard_participant "provider" "Local Provider" "$BPN_PROVIDER" "$DID_PROVIDER" \
    "$PROVIDER_DSP_URL" \
    "$PROVIDER_CREDENTIALS_URL" \
    "$PROVIDER_ONBOARDING_URL"
onboard_participant "consumer" "Local Consumer" "$BPN_CONSUMER" "$DID_CONSUMER" \
    "$CONSUMER_DSP_URL" \
    "$CONSUMER_CREDENTIALS_URL" \
    "$CONSUMER_ONBOARDING_URL"

step "Verifying public participant directory"
operator_directory="$(curl -sf "$OPERATOR_DIRECTORY_URL")"
printf "%s" "$operator_directory" | jq -e --arg provider "$BPN_PROVIDER" --arg consumer "$BPN_CONSUMER" '
  (.participants | length) == 2 and
  ([.participants[].bpn] | sort) == ([$provider, $consumer] | sort)
' >/dev/null || fail "operator directory does not contain both local participants"
ok "operator directory contains provider and consumer"

consumer_directory="$(curl -sf "${PORTAL_ADMIN_AUTH[@]}" "$CONSUMER_PORTAL_DIRECTORY_URL")"
printf "%s" "$consumer_directory" | jq -e --arg provider "$BPN_PROVIDER" '
  (.participants | length) == 1 and .participants[0].bpn == $provider
' >/dev/null || fail "consumer portal directory does not contain only the provider"
ok "consumer portal discovers provider"

provider_directory="$(curl -sf "${PORTAL_ADMIN_AUTH[@]}" "$PROVIDER_PORTAL_DIRECTORY_URL")"
printf "%s" "$provider_directory" | jq -e --arg consumer "$BPN_CONSUMER" '
  (.participants | length) == 1 and .participants[0].bpn == $consumer
' >/dev/null || fail "provider portal directory does not contain only the consumer"
ok "provider portal discovers consumer"

printf "\nBootstrap complete.\n"
