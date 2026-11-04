# Existing deployment setup — Supabase + Render + Vercel

Updated 2026-11-04 from the owner's existing deployment. Keep these services:

| Component | Existing service |
| --- | --- |
| Application database | Supabase project `app_db` |
| Sample analytics database | Supabase project `chinook` |
| API | https://sql-data-cockpit-backend.onrender.com |
| Frontend | https://sql-data-cockpit.vercel.app |

The screenshot shows the two named projects in `ap-southeast-1`. A Supabase project's name is not necessarily its PostgreSQL database name; copy the actual database and role values from its Connect panel. No Neon account, extra database project, or Render-hosted frontend is needed.

## What the public checks established

- Both the API health endpoint and frontend responded HTTP 200.
- The public frontend bundle points at the supplied Render backend.
- The deployed API schema lacks `/auth/verify-email`, `/auth/reset-password`, `/analyses`, and the required review token. The frontend bundle also lacks the new review-token and verification interfaces. The latest local hardening has not been deployed as a coordinated frontend/backend release.
- These public checks do not verify database permissions, connection mode, migrations, private environment settings, or live email delivery.
- Local `.env` settings use direct Supabase connections on 5432. Read-only TLS/schema probes could not resolve those configured hostnames from this machine, so database checks did not complete and no remote records were read or changed. Render may have different or newer environment values.

The live API also accepted a credentialed CORS preflight from an unrelated origin. This is a confirmed deployment issue. Deploy the local strict-origin/auth changes and repeat the check; merely having both endpoints return HTTP 200 is not readiness. Full evidence is in `DEPLOYMENT_CHECK.md`.

## 1. Confirm Supabase connection mode

Open each project's **Connect** panel. For the long-lived API, use a direct connection if the deployment network supports it, or the shared **Session pooler** on port **5432**. Use the exact hostname and role from that panel. Direct endpoints are generally `db.<project-ref>.supabase.co`; session poolers use a `*.pooler.supabase.com` hostname and a project-qualified role.

Do not use the Transaction pooler on **6543** for these settings. The app uses prepared statements and persistent checkpoint connections; the tested deployment path is direct/session mode. The previous repository migration guide incorrectly recommended transaction mode and has been replaced.

In Render, privately configure:

| Variable | Required source |
| --- | --- |
| `APP_DB_URL` | `app_db` direct/session connection for application queries and workflow locks |
| `APP_DB_SYNC_URL` | Same application project, direct/session connection for checkpoints and startup migrations |
| `CHINOOK_DB_URL` | `chinook` project, direct/session connection using a dedicated read-only role |

Production normalizes `postgresql://` application/sample URLs for asyncpg. `APP_DB_SYNC_URL` should use `postgresql://`. Percent-encode special characters in URI passwords. Do not paste connection strings into chat or put them into frontend environment variables.

## 2. Verify provider certificates

All production application, checkpoint, and migration paths require certificate verification. If the selected Supabase endpoint needs its project CA, download it from the project's database settings and mount it as a Render Secret File:

```text
APP_DB_CA_CERT_FILE=/etc/secrets/app-db-ca.crt
CHINOOK_DB_CA_CERT_FILE=/etc/secrets/chinook-db-ca.crt
```

Each path must match the Secret File you actually add. These optional settings are backend-only. The existing public CA bundle remains the default. A missing/incorrect CA causes failure; do not disable verification to make a connection work. No Supabase certificate has been downloaded or installed by the agent yet.

## 3. Preserve the working origins and secrets

Render:

```text
FRONTEND_URL=https://sql-data-cockpit.vercel.app
ALLOWED_ORIGINS=https://sql-data-cockpit.vercel.app
SECURE_COOKIES=true
ENVIRONMENT=production
```

Vercel, for the target deployment environment:

```text
VITE_API_URL=https://sql-data-cockpit-backend.onrender.com
```

The frontend URL is a build-time value; redeploy the frontend after a change. Keep the current `JWT_SECRET_KEY` unless performing a planned migration: it also derives encryption for existing stored connection credentials. The local reference `render.yaml` now describes only the existing API; it prompts for the existing secret rather than generating a replacement. Do not blindly sync that file: review the service name, branch, region and plan against the existing service first.

Vercel is already configured with `frontend/vercel.json` for SPA routes. Keep the existing frontend project and review its Git branch/root directory rather than creating another site.

## 4. Release the local changes together

The release branch is `codex/analysis-workspace`. The owner confirmed both services deploy from `main`. The tested changes are being packaged for review on the feature branch; no merge into main, cloud configuration change, Supabase migration, or coordinated production deployment has been performed.

1. Review and commit the intended app changes; exclude local secrets, generated artifacts and unrelated notebooks.
2. Confirm the branch tracked by the existing Render and Vercel projects. Push the reviewed branch only as part of the coordinated release.
3. Back up the application database. Inspect its current Alembic revision before applying migrations. If it was created manually and is unversioned, compare its schema to the baseline before considering a stamp; never blindly stamp or rerun the old SQL bootstrap.
4. Apply migrations and prepare checkpoint tables using an appropriate migration identity. The current Docker entrypoint runs migrations with `APP_DB_SYNC_URL`, so that identity needs migration privileges. Separating privileged migration/bootstrap from runtime checkpoint access remains production release work.
5. Deploy the matching API and frontend versions, then test login/refresh cookies, signup/verification, ask/reject/approve, saved analyses, and database connections through the actual browser origins. Old approval requests need a new question after the protocol update.

The previous local test results do not establish that this existing deployment has the same code or database schema.

## 5. Approved email setup: Gmail over HTTPS

The owner selected `omb4027@gmail.com` as the sender and confirmed the Render backend is on the Free plan. Use `MAIL_TRANSPORT=gmail_api` and the one-time OAuth setup in [GMAIL_SETUP.md](GMAIL_SETUP.md). This avoids blocked SMTP ports and does not require purchasing a sender domain.

Google Cloud client creation, owner consent, private Render environment values, OAuth publishing readiness and a real delivery test are still required. No Google OAuth credentials have been supplied and no real email has been sent. Both services deploy from `main`; keep the release on its feature branch until these prerequisites and the migration backup are ready.

## Sources

- Supabase connection modes, IPv4/IPv6 and certificate setup: https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase SSL verification: https://supabase.com/docs/guides/platform/ssl-enforcement
- Resend SMTP: https://resend.com/docs/send-with-smtp
- Render SMTP port restrictions: https://render.com/docs/free

Legacy local checkpoints remain retained at the owner's explicit request. This document does not authorize deleting them or modifying either existing Supabase project.
