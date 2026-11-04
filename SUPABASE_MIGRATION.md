# Supabase connection and upgrade guide

The application already uses two Supabase projects: `app_db` and `chinook`. The backend is on Render and the frontend is on Vercel. Follow [STAGING_SETUP.md](STAGING_SETUP.md) for the current upgrade procedure.

## Correction to the previous guide

The old document recommended Supabase Transaction pooler URLs on port 6543 for all connections. That recommendation is incompatible with the current tested persistent-connection design. Use a reachable direct endpoint or the shared **Session pooler on port 5432**, with certificate verification enabled. Confirm the mode in Supabase's Connect panel rather than changing a port in a guessed URL.

The old document also contained a manual SQL bootstrap for an older schema. It is removed to prevent running stale DDL against existing user data. Inspect the existing schema and Alembic revision, back up the database, then apply the reviewed migrations. Do not recreate projects, rotate database passwords, reuse the application owner's credentials for read-only analytics, or stamp an unversioned database without validating its baseline.

Project names do not determine database names or pooler usernames. Use the exact project connection details, privately, from Supabase. Do not put any database credentials in Vercel's public `VITE_` variables.

Sources: [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase SSL verification](https://supabase.com/docs/guides/platform/ssl-enforcement).
