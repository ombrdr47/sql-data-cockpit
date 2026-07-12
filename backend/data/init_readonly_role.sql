-- init_readonly_role.sql
-- Creates a read-only Postgres role for the agent to use when querying Chinook.
-- This is enforced at the database level, NOT via prompt instruction.
-- Even if SQL validation is bypassed, this role cannot write.

-- Create read-only role (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chinook_ro') THEN
    CREATE ROLE chinook_ro WITH LOGIN PASSWORD 'readonlypass' NOINHERIT;
  END IF;
END
$$;

-- Grant connection rights
GRANT CONNECT ON DATABASE chinook TO chinook_ro;

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO chinook_ro;

-- Grant SELECT on all current tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO chinook_ro;

-- Ensure future tables are also covered (for schema migrations)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO chinook_ro;

-- Set statement timeout at the ROLE level (5 seconds)
-- This means even if the app-level timeout is bypassed, the DB enforces it.
ALTER ROLE chinook_ro SET statement_timeout = '5s';
