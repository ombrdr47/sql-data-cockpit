# Release operations

These checks target the local development deployment unless explicitly configured otherwise. They do not publish the app, provision hosting, or create an email provider account.

## Repeatable checks

```sh
docker compose exec -T backend python -m pytest backend/tests -q
docker compose exec -T backend python -m backend.tests.live_security_check
docker compose exec -T backend python -m backend.ops.check_concurrency
docker compose exec -T backend python -m backend.ops.check_accuracy
docker compose exec -T postgres sh -s < backend/ops/restore_check.sh
```

The concurrency check creates and cleans up disposable accounts and verifies database guards from four independent processes. It does not measure full application/LLM capacity. The restore check creates a private temporary dump inside PostgreSQL's container, restores it into a uniquely named temporary database, validates schema availability, then deletes the temporary artifacts. It does not configure scheduled backups or their retention.

## Legacy workflow cleanup

Preview only:

```sh
docker compose exec -T backend python -m backend.ops.legacy_checkpoints
```

The preview prints counts and a plan hash, never credentials or conversation text. It targets workflow threads with a `groq_api_key` checkpoint channel. All execution checkpoints for those threads are included because older state can contain derived sensitive data. Existing conversations, messages, saved analyses, accounts, and database connections remain intact. Old paused runs become non-resumable.

After the owner approves the exact preview, stop workflow traffic and all backend workers. Apply using that exact hash (a changed plan is rejected):

```sh
docker compose stop backend
docker compose run --rm --no-deps backend python -m backend.ops.legacy_checkpoints --apply --plan-sha256 APPROVED_HASH --confirm-workflows-stopped
docker compose start backend
```

Do not run `--apply` without owner approval and a maintenance window. The tool also acquires the normal per-conversation execution locks and refuses active threads. The tool does not erase external traces, older backups, stored query-result snapshots, or provider logs. Rotate affected provider keys after cleanup; deleting checkpoint records is not key rotation. No general retention policy is enabled automatically.

## External PostgreSQL/TLS check

Use a disposable public PostgreSQL database with a read-only account and a publicly trusted TLS certificate. Set `CHECK_DB_HOST`, `CHECK_DB_PORT`, `CHECK_DB_NAME`, `CHECK_DB_USER`, and `CHECK_DB_PASSWORD` in the operator environment through a secret manager or private environment file; never paste them into chat or commit them.

```sh
python -m backend.ops.check_database_tls
```

Run in an environment with the backend requirements installed. The check uses the actual customer connector, runs SELECT/SHOW only, verifies the read-only default and timeout, then reconnects to the same validated public IP with a deliberately incorrect TLS hostname. A failure unrelated to certificate verification is reported as inconclusive rather than counted as success. The script does not read customer tables.

## Existing deployment: password-only release

The owner chose email/password sign-in without verification or recovery emails for this release.
The existing hosts are Render Free, Vercel, and Supabase; both hosts deploy from `main`.
Before deploying the release, set these values on the existing Render service:

```text
EMAIL_VERIFICATION_REQUIRED=false
MAIL_TRANSPORT=disabled
FRONTEND_URL=https://sql-data-cockpit.vercel.app
ALLOWED_ORIGINS=https://sql-data-cockpit.vercel.app
```

Use Save only until the code is ready. These values override the pending Gmail transport.
Keep the existing JWT_SECRET_KEY and database URLs. Do not delete or rotate secrets as part
of this change. Gmail credentials can remain unused while mail is disabled.

Signup creates an authenticated session without sending email. Existing unverified accounts
can sign in and refresh sessions, but are not marked as having verified ownership. Email
verification, resend and email-based reset endpoints return 503 without doing account lookup
or sending mail. The login page hides recovery and shared demo actions in production.
Authenticated password changes still require the current password and revoke older sessions.

Before merging: confirm a recoverable Supabase backup, the current schema/migration revision,
verified TLS connectivity, and runtime privileges. Never stamp an unknown schema as current.
Legacy workflow checkpoints remain intact at the owner's request.

After deployment: verify trusted/untrusted CORS, personal signup/login/refresh/logout,
change-password session invalidation, source connection, SQL review, and saved analysis rerun.

Email verification remains enabled by default in code. Restoring it later requires a working
mail transport and an explicit migration plan for users whose email ownership is unverified.

The frontend API URL is a build-time value. Vercel VITE_API_URL must remain
`https://sql-data-cockpit-backend.onrender.com`; runtime changes do not alter a built bundle.
