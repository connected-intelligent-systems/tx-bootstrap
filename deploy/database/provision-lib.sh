#!/bin/sh
set -eu

DATABASE_PROVISION_ROOT="${DATABASE_PROVISION_ROOT:-/opt/tx-bootstrap/database}"
SQL_DIR="$DATABASE_PROVISION_ROOT/sql"
ADMIN_DATABASE="${PGDATABASE:-postgres}"

require_env() {
    name="$1"
    eval "value=\${$name:-}"
    if [ -z "$value" ]; then
        echo "$name must be set" >&2
        exit 1
    fi
}

psql_file() {
    database="$1"
    file="$2"
    PGDATABASE="$database" psql --no-psqlrc --set=ON_ERROR_STOP=1 --file="$file"
}

ensure_login_role() {
    export TARGET_ROLE="$1" TARGET_PASSWORD="$2"
    psql_file "$ADMIN_DATABASE" "$SQL_DIR/ensure-login-role.sql"
}

ensure_group_role() {
    export TARGET_ROLE="$1"
    psql_file "$ADMIN_DATABASE" "$SQL_DIR/ensure-group-role.sql"
}

ensure_role_membership() {
    export GROUP_ROLE="$1" LOGIN_ROLE="$2"
    psql_file "$ADMIN_DATABASE" "$SQL_DIR/ensure-role-membership.sql"
}

ensure_database() {
    export TARGET_DATABASE="$1" DATABASE_OWNER_ROLE="$2"
    psql_file "$ADMIN_DATABASE" "$SQL_DIR/ensure-database.sql"
    psql_file "$1" "$SQL_DIR/harden-public-schema.sql"
    psql_file "$1" "$SQL_DIR/adopt-public-objects.sql"
}

grant_database_connect() {
    export TARGET_DATABASE="$1" TARGET_ROLE="$2"
    psql_file "$ADMIN_DATABASE" "$SQL_DIR/grant-database-connect.sql"
}
