\set ON_ERROR_STOP on
\getenv database_owner DATABASE_OWNER_ROLE

SELECT format(
  'ALTER %s %I.%I OWNER TO %I',
  CASE c.relkind
    WHEN 'S' THEN 'SEQUENCE'
    WHEN 'v' THEN 'VIEW'
    WHEN 'm' THEN 'MATERIALIZED VIEW'
    WHEN 'f' THEN 'FOREIGN TABLE'
    ELSE 'TABLE'
  END,
  n.nspname,
  c.relname,
  :'database_owner'
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
\gexec

SELECT format(
  'ALTER %s %I.%I(%s) OWNER TO %I',
  CASE p.prokind
    WHEN 'p' THEN 'PROCEDURE'
    WHEN 'a' THEN 'AGGREGATE'
    ELSE 'FUNCTION'
  END,
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid),
  :'database_owner'
)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
\gexec
