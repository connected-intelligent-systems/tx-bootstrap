\set ON_ERROR_STOP on
\getenv target_database TARGET_DATABASE
\getenv database_owner DATABASE_OWNER_ROLE

SELECT format('CREATE DATABASE %I OWNER %I', :'target_database', :'database_owner')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'target_database')
\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'target_database', :'database_owner')
\gexec

SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM PUBLIC', :'target_database')
\gexec
