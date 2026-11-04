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

## Deployment settings still needed

- Hosting target, HTTPS frontend origin and API URL.
- SMTP provider, verified sender domain/address, and credentials supplied privately.
- A disposable external PostgreSQL instance for the above interoperability test.
- Runtime database privileges, migration identity, backup scheduling, and a retention/deletion policy.

The frontend API URL is a **build argument**: set `VITE_API_URL` before `docker compose build frontend`. Setting it only on a running nginx container does not change compiled browser code. A production build must not use `http://localhost:8000`. The development Compose file is not a production deployment configuration.

Production rejects malformed/non-HTTPS origins and the default localhost mail sender. Configure `MAIL_TRANSPORT=smtp`, `SMTP_HOST`, STARTTLS and a real `MAIL_FROM`, plus strong application secrets. Never reuse the development database passwords.
