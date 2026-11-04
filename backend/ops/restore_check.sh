#!/bin/sh
# Run inside the PostgreSQL service; original data is never modified.
# docker compose exec -T postgres sh -s < backend/ops/restore_check.sh
set -eu
source_db="${RESTORE_SOURCE_DB:-app_db}"
operator="${PGUSER:-postgres}"
restore_db="cockpit_restore_check_$(date +%s)_$$"
umask 077
dump_path="$(mktemp /tmp/cockpit-restore.XXXXXX)"
cleanup() {
  dropdb -U "$operator" --if-exists "$restore_db" >/dev/null 2>&1 || true
  rm -f "$dump_path"
}
trap cleanup EXIT INT TERM
pg_dump -U "$operator" -d "$source_db" -Fc -f "$dump_path"
createdb -U "$operator" "$restore_db"
pg_restore -U "$operator" --exit-on-error -d "$restore_db" "$dump_path"
psql -U "$operator" -d "$restore_db" -v ON_ERROR_STOP=1 -At -c "SELECT 'migration=' || version_num FROM alembic_version; SELECT 'critical_tables=' || count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','conversations','messages','saved_analyses','query_usage'); SELECT 'foreign_keys=' || count(*) FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND table_schema='public';"
printf '%s\n' 'PASS: isolated restore completed; temporary database and dump removed on exit'
