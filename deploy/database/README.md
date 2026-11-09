# PostgreSQL provisioning

Provision databases before deploying the reusable applications. You need
`psql` and a PostgreSQL administrator that can create databases and roles.
Application containers use separate, restricted logins.

## Connect to PostgreSQL

Supply the administrator connection through libpq environment variables:

```text
PGHOST
PGPORT
PGUSER
PGPASSWORD
PGDATABASE        # optional; defaults to postgres
PGSSLMODE         # use verify-full for remote deployments
PGSSLROOTCERT     # CA path if needed
```

Inject credentials through your deployment platform. Keep administrator
credentials out of application environment files and Kubernetes Secrets.

## Provision the operator

Set these password variables. Database and user names have defaults in the
[operator provisioner](operator/provision.sh):

```text
ISSUER_IDENTITYHUB_DB_PASSWORD
ISSUER_SERVICE_DB_PASSWORD
BDRS_DB_PASSWORD
OPERATOR_MIGRATOR_DB_PASSWORD
OPERATOR_CONSOLE_DB_PASSWORD
REGISTRATION_DB_PASSWORD
ISSUER_CLAIMS_DB_PASSWORD
```

Run from the repository root:

```sh
DATABASE_PROVISION_ROOT="$PWD/deploy/database" \
  deploy/database/operator/provision.sh
```

This creates four databases: issuer wallet, issuer service, BDRS, and operator
application state. The console and onboarding service use restricted logins;
only migration jobs can change the operator application's schema.

## Provision each participant

Use unique database and role names for every participant. All variables below
are required:

```text
PARTICIPANT_IDENTITYHUB_DB_NAME
PARTICIPANT_IDENTITYHUB_DB_USER
PARTICIPANT_IDENTITYHUB_DB_PASSWORD
PARTICIPANT_EDC_DB_NAME
PARTICIPANT_EDC_DB_USER
PARTICIPANT_EDC_DB_PASSWORD
PARTICIPANT_PORTAL_DB_NAME
PARTICIPANT_PORTAL_OWNER_ROLE
PARTICIPANT_PORTAL_MIGRATOR_DB_USER
PARTICIPANT_PORTAL_MIGRATOR_DB_PASSWORD
PARTICIPANT_PORTAL_DB_ROLE
PARTICIPANT_PORTAL_DB_PASSWORD
```

```sh
DATABASE_PROVISION_ROOT="$PWD/deploy/database" \
  deploy/database/participant/provision.sh
```

This creates separate databases for the wallet, connector, and portal. The
portal runtime cannot change its schema. Wallet and connector services manage
their own schema migrations at startup.

## Deploy and maintain

After provisioning, configure the application's database URLs and deploy the
stack. Use TLS-enabled connections and percent-encode credentials embedded in
URLs. The application migration jobs must succeed before dependent services
start.

Rerunning the provisioners creates missing resources, updates supplied
passwords, and repairs ownership and grants. They do not delete databases or
roles. Plan and verify backups separately.

The [local Compose demo](../../docs/local-deployment.md) runs the same
provisioners automatically against its shared PostgreSQL instance.
