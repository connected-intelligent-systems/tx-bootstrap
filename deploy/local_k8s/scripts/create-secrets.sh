#!/bin/bash
set -euo pipefail

# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_commands kubectl
check_context

postgres_host="tx-postgres-rw.tx-infra.svc.cluster.local"

create_secret_manifest tx-infra tx-operator-database-passwords \
    "$GENERATED_DIR/operator-database-passwords.yaml" \
    --from-literal="ISSUER_IDENTITYHUB_DB_PASSWORD=$ISSUER_IDENTITYHUB_DB_PASSWORD" \
    --from-literal="ISSUER_SERVICE_DB_PASSWORD=$ISSUER_SERVICE_DB_PASSWORD" \
    --from-literal="BDRS_DB_PASSWORD=$BDRS_DB_PASSWORD" \
    --from-literal="OPERATOR_MIGRATOR_DB_PASSWORD=$OPERATOR_MIGRATOR_DB_PASSWORD" \
    --from-literal="OPERATOR_CONSOLE_DB_PASSWORD=$OPERATOR_CONSOLE_DB_PASSWORD" \
    --from-literal="REGISTRATION_DB_PASSWORD=$REGISTRATION_DB_PASSWORD" \
    --from-literal="ISSUER_CLAIMS_DB_PASSWORD=$ISSUER_CLAIMS_DB_PASSWORD"

create_secret_manifest tx-infra tx-provider-database-passwords \
    "$GENERATED_DIR/provider-database-passwords.yaml" \
    --from-literal="PARTICIPANT_IDENTITYHUB_DB_PASSWORD=$PROVIDER_IDENTITYHUB_DB_PASSWORD" \
    --from-literal="PARTICIPANT_EDC_DB_PASSWORD=$PROVIDER_EDC_DB_PASSWORD" \
    --from-literal="PARTICIPANT_PORTAL_MIGRATOR_DB_PASSWORD=$PROVIDER_PORTAL_MIGRATOR_DB_PASSWORD" \
    --from-literal="PARTICIPANT_PORTAL_DB_PASSWORD=$PROVIDER_PORTAL_DB_PASSWORD"

create_secret_manifest tx-infra tx-consumer-database-passwords \
    "$GENERATED_DIR/consumer-database-passwords.yaml" \
    --from-literal="PARTICIPANT_IDENTITYHUB_DB_PASSWORD=$CONSUMER_IDENTITYHUB_DB_PASSWORD" \
    --from-literal="PARTICIPANT_EDC_DB_PASSWORD=$CONSUMER_EDC_DB_PASSWORD" \
    --from-literal="PARTICIPANT_PORTAL_MIGRATOR_DB_PASSWORD=$CONSUMER_PORTAL_MIGRATOR_DB_PASSWORD" \
    --from-literal="PARTICIPANT_PORTAL_DB_PASSWORD=$CONSUMER_PORTAL_DB_PASSWORD"

create_secret_manifest tx-operator tx-bootstrap-operator-secrets \
    "$GENERATED_DIR/operator-application-secrets.yaml" \
    --from-literal="vault-token=$OPERATOR_VAULT_TOKEN" \
    --from-literal="identityhub-jdbc-url=jdbc:postgresql://${postgres_host}:5432/issuer_wallet?sslmode=disable" \
    --from-literal="identityhub-db-user=issuer_identityhub" \
    --from-literal="identityhub-db-password=$ISSUER_IDENTITYHUB_DB_PASSWORD" \
    --from-literal="issuer-service-jdbc-url=jdbc:postgresql://${postgres_host}:5432/issuer?sslmode=disable" \
    --from-literal="issuer-service-db-user=issuer_service" \
    --from-literal="issuer-service-db-password=$ISSUER_SERVICE_DB_PASSWORD" \
    --from-literal="bdrs-jdbc-url=jdbc:postgresql://${postgres_host}:5432/bdrs?sslmode=disable" \
    --from-literal="bdrs-db-user=bdrs" \
    --from-literal="bdrs-db-password=$BDRS_DB_PASSWORD" \
    --from-literal="operator-migrator-database-url=postgresql://operator_migrator:${OPERATOR_MIGRATOR_DB_PASSWORD}@${postgres_host}:5432/dataspace_admin?sslmode=disable" \
    --from-literal="operator-console-database-url=postgresql://operator_console_login:${OPERATOR_CONSOLE_DB_PASSWORD}@${postgres_host}:5432/dataspace_admin?sslmode=disable" \
    --from-literal="onboarding-database-url=postgresql://registration_svc_login:${REGISTRATION_DB_PASSWORD}@${postgres_host}:5432/dataspace_admin?sslmode=disable" \
    --from-literal="issuer-migrator-database-url=postgresql://issuer_service:${ISSUER_SERVICE_DB_PASSWORD}@${postgres_host}:5432/issuer?sslmode=disable" \
    --from-literal="issuer-claims-database-url=postgresql://issuer_claims_writer:${ISSUER_CLAIMS_DB_PASSWORD}@${postgres_host}:5432/issuer?sslmode=disable" \
    --from-literal="bdrs-api-key=$BDRS_API_KEY" \
    --from-literal="operator-console-api-key=$OPERATOR_CONSOLE_API_KEY"

create_secret_manifest tx-provider tx-bootstrap-provider-secrets \
    "$GENERATED_DIR/provider-application-secrets.yaml" \
    --from-literal="vault-token=$PROVIDER_VAULT_TOKEN" \
    --from-literal="identityhub-superuser-api-key=$IDENTITYHUB_SUPERUSER_API_KEY" \
    --from-literal="identityhub-jdbc-url=jdbc:postgresql://${postgres_host}:5432/provider_wallet?sslmode=disable" \
    --from-literal="identityhub-db-user=provider_identityhub" \
    --from-literal="identityhub-db-password=$PROVIDER_IDENTITYHUB_DB_PASSWORD" \
    --from-literal="edc-jdbc-url=jdbc:postgresql://${postgres_host}:5432/provider_edc?sslmode=disable" \
    --from-literal="edc-db-user=provider_edc" \
    --from-literal="edc-db-password=$PROVIDER_EDC_DB_PASSWORD" \
    --from-literal="portal-migrator-database-url=postgresql://provider_portal_migrator:${PROVIDER_PORTAL_MIGRATOR_DB_PASSWORD}@${postgres_host}:5432/provider_portal?sslmode=disable" \
    --from-literal="portal-database-url=postgresql://provider_portal:${PROVIDER_PORTAL_DB_PASSWORD}@${postgres_host}:5432/provider_portal?sslmode=disable" \
    --from-literal="edc-api-key=$EDC_API_KEY" \
    --from-literal="federated-catalog-api-key=$FEDERATED_CATALOG_API_KEY"

create_secret_manifest tx-consumer tx-bootstrap-consumer-secrets \
    "$GENERATED_DIR/consumer-application-secrets.yaml" \
    --from-literal="vault-token=$CONSUMER_VAULT_TOKEN" \
    --from-literal="identityhub-superuser-api-key=$IDENTITYHUB_SUPERUSER_API_KEY" \
    --from-literal="identityhub-jdbc-url=jdbc:postgresql://${postgres_host}:5432/consumer_wallet?sslmode=disable" \
    --from-literal="identityhub-db-user=consumer_identityhub" \
    --from-literal="identityhub-db-password=$CONSUMER_IDENTITYHUB_DB_PASSWORD" \
    --from-literal="edc-jdbc-url=jdbc:postgresql://${postgres_host}:5432/consumer_edc?sslmode=disable" \
    --from-literal="edc-db-user=consumer_edc" \
    --from-literal="edc-db-password=$CONSUMER_EDC_DB_PASSWORD" \
    --from-literal="portal-migrator-database-url=postgresql://consumer_portal_migrator:${CONSUMER_PORTAL_MIGRATOR_DB_PASSWORD}@${postgres_host}:5432/consumer_portal?sslmode=disable" \
    --from-literal="portal-database-url=postgresql://consumer_portal:${CONSUMER_PORTAL_DB_PASSWORD}@${postgres_host}:5432/consumer_portal?sslmode=disable" \
    --from-literal="edc-api-key=$EDC_API_KEY" \
    --from-literal="federated-catalog-api-key=$FEDERATED_CATALOG_API_KEY"

echo "Local Kubernetes Secrets are configured."
