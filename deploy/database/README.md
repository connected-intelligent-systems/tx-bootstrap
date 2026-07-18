# PostgreSQL provisioning

The reusable operator and participant stacks require an existing PostgreSQL
service. This package separates cluster provisioning from schema migration:

1. Infrastructure automation creates the PostgreSQL service and its backup,
   recovery, monitoring, encryption, and high-availability policy.
2. A privileged delivery job runs one of these provisioning scripts.
3. The application deployment runs its narrowly scoped migration jobs.
4. Runtime services start with non-administrator logins.

No reusable Compose service receives the PostgreSQL administrator credential.
Use dedicated databases for this stack. The provisioner assigns the `public`
schema to the dedicated owner role before the first application migration
runs.

## Role and database model

| Database                         | Schema owner / upstream runtime            | Additional access                                                                                      |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| operator IdentityHub database    | `ISSUER_IDENTITYHUB_DB_USER`               | none                                                                                                   |
| Issuer Service database          | `ISSUER_SERVICE_DB_USER`                   | `ISSUER_CLAIMS_DB_USER`: `SELECT`, `INSERT`, `UPDATE` on `custom_attestation_claims` only              |
| BDRS database                    | `BDRS_DB_USER`                             | none                                                                                                   |
| `dataspace_admin`                | `DATASPACE_ADMIN_OWNER_ROLE` (no login)    | migrator is a member; console gets table DML; onboarding gets only approved security-definer functions |
| participant IdentityHub database | `PARTICIPANT_IDENTITYHUB_DB_USER`          | none                                                                                                   |
| participant EDC database         | `PARTICIPANT_EDC_DB_USER`                  | shared by that participant's control and data planes                                                   |
| participant portal database      | `PARTICIPANT_PORTAL_OWNER_ROLE` (no login) | migrator is a member; portal runtime gets DML on portal tables                                         |

Tractus-X components keep their packaged startup migrations, so their runtime
login owns its dedicated database. The two custom application schemas use a
separate login that can `SET ROLE` to one no-login owner role. Neither migrator
can create databases, create roles, replicate, or become superuser.

## Administrator connection

Provisioning requires a PostgreSQL administrator that can create databases and
roles. Supply its connection with standard libpq variables:

```text
PGHOST
PGPORT
PGUSER
PGPASSWORD
PGDATABASE        # optional; defaults to postgres
PGSSLMODE         # use verify-full outside trusted local development
PGSSLROOTCERT     # CA path when required by the provider
```

Inject passwords from the deployment platform's secret manager into the
short-lived job environment. Do not commit a production env file, log the
environment, or pass administrator credentials to Compose.

## Operator variables

The password variables are mandatory. Names default as shown:

| Variable                                                    | Default                                     |
| ----------------------------------------------------------- | ------------------------------------------- |
| `ISSUER_IDENTITYHUB_DB_NAME` / `ISSUER_IDENTITYHUB_DB_USER` | `issuer_wallet` / `issuer_identityhub`      |
| `ISSUER_SERVICE_DB_NAME` / `ISSUER_SERVICE_DB_USER`         | `issuer` / `issuer_service`                 |
| `BDRS_DB_NAME` / `BDRS_DB_USER`                             | `bdrs` / `bdrs`                             |
| `DATASPACE_ADMIN_DB_NAME` / `DATASPACE_ADMIN_OWNER_ROLE`    | `dataspace_admin` / `dataspace_admin_owner` |
| `OPERATOR_MIGRATOR_DB_USER`                                 | `operator_migrator`                         |
| `OPERATOR_CONSOLE_DB_USER`                                  | `operator_console_login`                    |
| `REGISTRATION_DB_USER`                                      | `registration_svc_login`                    |
| `ISSUER_CLAIMS_DB_USER`                                     | `issuer_claims_writer`                      |

Mandatory passwords are `ISSUER_IDENTITYHUB_DB_PASSWORD`,
`ISSUER_SERVICE_DB_PASSWORD`, `BDRS_DB_PASSWORD`,
`OPERATOR_MIGRATOR_DB_PASSWORD`, `OPERATOR_CONSOLE_DB_PASSWORD`,
`REGISTRATION_DB_PASSWORD`, and `ISSUER_CLAIMS_DB_PASSWORD`.

```sh
DATABASE_PROVISION_ROOT="$PWD/deploy/database" \
  deploy/database/operator/provision.sh
```

## Participant variables

Run one provisioner per participant and use unique names for every database and
role:

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

## Deployment run order

1. Run the relevant provisioner and retain its output as deployment evidence.
2. Populate the reusable Compose variables with TLS-enabled JDBC and libpq
   URLs. Percent-encode credentials embedded in URLs.
3. Deploy the stack. One-shot custom migrators must complete successfully;
   failed migrations stop dependent Node services from starting.
4. Tractus-X services perform their packaged migrations during startup. The
   issuer grant job waits for Issuer Service readiness before applying its
   narrow table grant.
5. Verify runtime access and database backups. Remove provisioning credentials
   from the delivery job immediately after completion.

The scripts are convergent: rerunning them creates missing resources, rotates
the supplied login passwords, restores database/schema/object ownership and
grants, and never drops roles or databases. Local Compose uses one PostgreSQL
instance on three role-private networks and runs the same provisioners on every
startup.
