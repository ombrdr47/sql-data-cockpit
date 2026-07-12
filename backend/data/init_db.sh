#!/usr/bin/env bash
# docker-entrypoint-initdb.d/init_db.sh
# Postgres runs scripts in /docker-entrypoint-initdb.d/ alphabetically.
# This script runs AFTER Chinook_PostgreSql.sql is loaded (alphabetical: i > C).
set -e

echo "==> Creating chinook database and app_db..."

# The Chinook SQL file creates a "chinook" database by default.
# We create app_db here, and set up the app user.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    -- Create app_db
    CREATE DATABASE app_db;

    -- Create app user (read-write for app_db)
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'appuser') THEN
        CREATE ROLE appuser WITH LOGIN PASSWORD 'apppass';
      END IF;
    END
    \$\$;

    GRANT ALL PRIVILEGES ON DATABASE app_db TO appuser;
EOSQL

echo "==> Initializing app_db schema..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "app_db" -f /docker-entrypoint-initdb.d/init_app_db.sql

# Grant appuser access to all tables created
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "app_db" <<-EOSQL
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO appuser;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO appuser;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO appuser;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO appuser;
EOSQL

echo "==> Checking if chinook DB exists, loading if needed..."
# Chinook_PostgreSql.sql creates its own DB — check and apply read-only role
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -f /docker-entrypoint-initdb.d/init_readonly_role.sql -d chinook 2>/dev/null || \
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -f /docker-entrypoint-initdb.d/init_readonly_role.sql -d postgres

echo "==> DB initialization complete."
