\set ON_ERROR_STOP on
\getenv target_role TARGET_ROLE
\getenv target_password TARGET_PASSWORD

SELECT format('CREATE ROLE %I LOGIN', :'target_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'target_role')
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT',
  :'target_role',
  :'target_password'
)
\gexec
