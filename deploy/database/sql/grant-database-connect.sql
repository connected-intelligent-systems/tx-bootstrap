\set ON_ERROR_STOP on
\getenv target_database TARGET_DATABASE
\getenv target_role TARGET_ROLE

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'target_database', :'target_role')
\gexec
