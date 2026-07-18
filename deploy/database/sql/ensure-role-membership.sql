\set ON_ERROR_STOP on
\getenv group_role GROUP_ROLE
\getenv login_role LOGIN_ROLE

SELECT format('GRANT %I TO %I', :'group_role', :'login_role')
WHERE NOT pg_has_role(:'login_role', :'group_role', 'MEMBER')
\gexec
