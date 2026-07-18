\set ON_ERROR_STOP on
\getenv target_role TARGET_ROLE

SELECT format('CREATE ROLE %I NOLOGIN', :'target_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'target_role')
\gexec

SELECT format(
  'ALTER ROLE %I WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
  :'target_role'
)
\gexec
