# Production readiness — updated 2026-11-04

Status: hardening passes container tests, PostgreSQL integration checks, and a running-API/model smoke test. Public release still requires external-database validation and operational setup.

## Changes in this pass

- Generated Python execution is disabled at both the graph routing and execution entry point. SQL results and narrative answers remain available; generated Python charts/statistical analysis do not run.
- Model API keys are resolved from the encrypted user record when a node needs them. They are no longer a graph state channel or argument to the streaming generator.
- SQL policy checks the entire AST, rejects nested writes, SELECT INTO, row locks, non-public schemas, qualified/unknown functions, and multiple statements. Execution repeats this policy and applies a SQL-level row cap.
- Customer connections use psycopg with a public address pinned in `hostaddr`, the original hostname for TLS verification, and a public CA bundle. Every new physical connection resolves and checks all A/AAAA addresses. Certificate failures never downgrade to plaintext. Custom/private CA databases and private network connections are not supported by this connector yet.
- Customer sessions have read-only defaults, a 5-second statement timeout, and a fixed `pg_catalog,public` search path. Customers must still supply a dedicated least-privilege role. Database grants are the table/column access boundary; there is not yet an application table-selection permission editor.
- Customer schema discovery no longer fetches sample rows. Its cache is scoped to engine identity and invalidated on disposal. Questions, schema, uploaded references, and approved results still go to the model provider; results and workflow context are persisted. The connection UI explicitly describes this.
- Each proposed SQL query has a new review token. Rejection resets the approval state, old tokens cannot approve replacement SQL, and source ownership is rechecked on resume.
- PostgreSQL transaction advisory locks serialize execution per account and conversation across API workers. Committed, bounded usage counters limit chat/review attempts to 20/minute and 200/day per account. A review consumes an attempt. Rejected concurrent attempts also consume quota. Interrupted requests retain their quota usage. Counters require migration 0005.
- Production refuses shared demo login, refresh, existing access tokens, and server-key resolution, and does not seed the demo account. Development sample access remains available.
- Production startup fails if durable workflow storage cannot initialize.
- Long-running execution locks use a separate bounded connection pool so they cannot starve the application pool used for credential lookups and result persistence.
- Deleted sources mark their conversations unavailable (migration 0006); follow-up questions return 409 instead of falling back to sample data. Legacy provenance is recovered only where stored result metadata proves the old source.
- Chat source/conversation IDs are validated before database access; question and review-feedback sizes are bounded.

## Verification

- Application-container backend suite: **260 tests passed**, including hardening and release-operation regression cases. Existing pytest deprecation warnings remain.
- Frontend production build passed in the preceding pass; the existing large-bundle warning remains. No frontend source changes were made in this continuation.
- Migrations 0005 and 0006 applied locally; runtime CRUD grants for `query_usage` are installed.
- Repeatable integration command: `docker compose exec -T backend python -m backend.tests.live_security_check`. Uses disposable users and deterministic model responses with real HTTP routing, PostgreSQL, LangGraph checkpoints, SQL execution, and auth. The fixtures are cleaned up afterward.
- Real PostgreSQL integration checks passed: 25 concurrent quota requests admit exactly 20; independent sessions contend correctly on execution locks; rejected SQL gets a fresh review token; stale/cross-account approvals fail; concurrent approvals produce one successful execution; new checkpoint state excludes the test model key; saved analyses rerun exact SQL; deleted sources cannot fall back to sample data.
- The local backend was restarted after these changes. A separate smoke test against the running API and configured model passed login, SQL generation, approval, real Chinook query execution, synthesis, and result persistence. Its test conversation/checkpoints were removed afterward.
- Four-process PostgreSQL verification passed: one execution lock admitted / three denied; 20 quota requests admitted / 12 denied. This is guard contention coverage, not full application capacity testing.
- Local backup/restore drill passed in a temporary database: migration 0006, all five checked critical tables and nine foreign keys were restored. The temporary database and private dump were removed.
- Legacy cleanup preview found 17 threads, with 3,546 writes, 3,743 blobs and 178 checkpoints. No legacy records have been deleted; the owner explicitly chose to keep them for now. Do not apply cleanup without new authorization.
- Repeatable cleanup, external TLS, concurrency and restore commands are documented in RELEASE_OPERATIONS.md.
- Previous approval-service blockage is resolved. Browser click-through and external customer PostgreSQL/TLS interoperability remain unverified.
- Reload the browser before using the updated review-token protocol. Previously pending approvals should be replaced with a new question.

- Docker frontend configuration now passes `VITE_API_URL` at build time and uses `npm ci`; production origins and email sender validation are stricter. `.dockerignore` excludes local secrets, email previews, virtual environments, node modules and build outputs.
- The frontend Docker image built successfully on November 4; nginx configuration validation also passed. The prior base-image download blockage is resolved.

## Required before public release

1. Repeat the verified workflows on the production-like staging deployment, including signup/email verification and a real customer database connection. Run concurrent approvals and quota exhaustion with multiple API worker processes and verify the deployed reverse proxy/cookie settings.
2. Validate verified TLS against a real, disposable public PostgreSQL instance using a least-privilege role. Confirm bad certificates fail without fallback and DNS changes cannot redirect to internal addresses. Keep outbound firewall restrictions as an additional deployment control.
3. **Existing checkpoints are not retroactively cleaned.** Old checkpoint blobs/writes may still contain model API keys and sampled data. Plan removal of legacy workflow checkpoints under the deployment's data-retention policy, then rotate affected provider keys. Do not treat removal of the state field as a historical data purge. This pass did not delete existing user conversations or workflow history.
4. Configure real SMTP, HTTPS origins/cookies, independent deployment secrets, runtime DB privileges, and a migration release step. Migration 0005's table needs SELECT/INSERT/UPDATE/DELETE grants when migrations run under a different owner. The Compose stack remains a development configuration.
5. Define and implement retention/deletion for workflow checkpoints and stored result snapshots, and verify backups on the actual deployment. A local restore drill has passed. Explain the provider data flow to users before connecting sensitive databases; this is not a zero-data-egress product.
6. Run an accuracy evaluation with known SQL answers, ambiguous table names, joins, metrics, nulls, and empty results, plus a concurrency/load test. Passing unit tests does not establish answer accuracy or capacity for thousands of users.

Do not enable generated Python again without an OS-isolated execution service with independent identity, no application secrets, enforced filesystem/network controls, and resource limits.

## Owner decisions

No staging host, domain, or disposable public database is available yet. The owner requested help setting up staging accounts on November 4; the Render/Neon/Resend account guide is in STAGING_SETUP.md. No accounts, paid resources or public deployments have been created by the agent. The 17 legacy workflow threads are intentionally retained at the owner's request. Their presence remains a public-release blocker; no cleanup or key rotation has been performed.

## November 4 accuracy evaluation

`python -m backend.ops.check_accuracy` now checks eight fixed questions using the real schema selector, SQL generator, validator, and execution nodes against public Chinook data, comparing result values to reference SQL. The corrected run passed **8/8** (count, grouping, joins, top-N order, nulls, empty results, follow-up filters and date range) with `openai/gpt-oss-120b`. The evaluator's first run had invalid reference column names; those were fixed before this result. This is a narrow sample-data smoke evaluation, not a general accuracy percentage or an evaluation of natural-language answer synthesis. No customer database or legacy checkpoints were touched.

Frontend dependency patches are applied within existing version ranges. The final runtime-only npm audit reports **zero known advisories**. The combined development/build dependency audit retains **12 moderate** advisories; npm proposes breaking changes for several, and no forced downgrade or incompatible update was applied. These remaining advisories require separate review before a public release.

`render.yaml` defines the staging Docker API and static frontend with manual deploys and prompted secrets. Smaller app/lock/checkpoint pool limits are configured for the first staging instance. Production async, checkpoint, and migration database paths now enforce certificate verification and normalize provider URL options; actual external-provider connectivity remains untested until the owner creates a database. The full local integration check passed again after these transport changes. Neither legacy checkpoint records nor cloud resources were changed.

The final patched frontend image built successfully with Vite 8.3.5 and the current lockfile. The staging blueprint passed Render JSON Schema validation; validation ignored the URI format annotation for the unused maintenance-mode field. No Render service was created.


## Existing deployment correction — November 4

The owner confirmed an existing Supabase/Render/Vercel deployment. Supabase projects are `app_db` and `chinook`; API is `https://sql-data-cockpit-backend.onrender.com`; frontend is `https://sql-data-cockpit.vercel.app`. Neon and an additional Render frontend are no longer part of the plan. These facts supersede earlier account-provisioning assumptions above.

Public checks: API health and frontend returned 200; the public frontend bundle targets the supplied API. The deployed API lacks verification/reset, analyses and the required review-token schema, and the frontend bundle lacks the new verification/review interfaces. Local passing tests therefore do not establish deployed readiness. No private settings, Supabase schema, credentials or remote data were accessed.

`STAGING_SETUP.md` now describes this existing stack. `SUPABASE_MIGRATION.md` replaces the old unsafe transaction-pooler/manual-DDL instructions. `render.yaml` contains only an API reference with the actual frontend origin, and prompts for the existing JWT secret. The local transport now accepts operator-mounted per-project CA certificates, preserving certificate verification. Actual Supabase endpoint connectivity and deployed migration status remain unverified.

The Supabase CA additions pass the full 252-test backend suite. Local `.env` URLs classify as direct connections on 5432, but read-only probes could not resolve their hostnames from this machine (`gaierror`); no remote schema or permission checks completed. This does not establish a live-database outage or confirm Render uses the same URLs. The public frontend/API checks were successful.

Public CORS checks additionally confirmed that the existing API reflects an untrusted Origin with `Access-Control-Allow-Credentials: true`. This was an unauthenticated OPTIONS check, not a session exploit. DEPLOYMENT_CHECK.md records the evidence and coordinated-release requirements. The locally passing strict-origin code has not been deployed to the supplied public service.


## Approved mail and CI release preparation

The owner confirmed both existing services deploy from `main`, chose `omb4027@gmail.com` as sender, and confirmed Render Free. Gmail delivery is now implemented over HTTPS with refresh-token authorization; it does not use blocked SMTP ports. GMAIL_SETUP.md documents the send-only OAuth owner flow, private Render variables and Google's seven-day Testing-token limitation. No live authorization, delivery, or Google Cloud configuration was performed. This remains a merge blocker for the verification migration.

CI now initializes the application database using Alembic migrations rather than the stale SQL bootstrap, runs the persisted approval/quota/isolation integration check, and uses the updated bounded accuracy runner with a disposable identity. Live accuracy evaluation is skipped explicitly if GROQ_API_KEY is not available. The backend Ruff check passes after unused imports were removed. The release is prepared on the feature branch; main is not modified.

Final mail/CI checks: 260 backend tests and Ruff pass; fresh-database migrations, persisted workflow integration, migration downgrade/reapply and the disposable-identity live accuracy runner pass (8/8). Gmail delivery and owner OAuth output have mocked tests; no real Google authorization or message delivery is claimed. The feature release is ready to package for review, with the production mail authorization and Supabase deployment checks still blocking merge.
