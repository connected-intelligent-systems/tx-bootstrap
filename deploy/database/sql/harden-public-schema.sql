\set ON_ERROR_STOP on
\getenv database_owner DATABASE_OWNER_ROLE

SELECT format('ALTER SCHEMA public OWNER TO %I', :'database_owner')
\gexec

REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
