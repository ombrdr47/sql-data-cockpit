## What changed

Turn the SQL chat demo into an owner-scoped analysis workspace: inspect and approve proposed SQL, explore results, save and rerun exact SQL, and add optional encrypted business-reference documents when connecting a PostgreSQL source. Redesign the landing, authentication, chat and database-connection flows.

Harden authentication, recovery, query approval and outbound database access. Keep the owner-approved password-only sign-in flow for this release using EMAIL_VERIFICATION_REQUIRED=false and MAIL_TRANSPORT=disabled. Email verification and recovery are deferred; the Gmail integration stays dormant. Update the existing CI to test migrations, persisted approval/quota behavior and bounded sample accuracy.

## Why

The existing public deployment serves an older API and reflects untrusted credentialed CORS origins. Local changes need a coordinated release before the new security properties reach users. Keeping source ownership, saved SQL, approval tokens and execution guards explicit prevents cross-account access, stale approvals, duplicate execution and silent fallback after source removal.

## How to test

- `ruff check --config pyproject.toml backend/` — passes.
- Backend application-container suite — 265 tests pass; the final two additional password-only cases also pass (7 new mode-specific tests total).
- `python -m backend.tests.live_security_check` — real PostgreSQL/HTTP/checkpoints with deterministic model responses; passes including concurrent approvals, source deletion and exact saved-query reruns.
- Fresh migrations 0001–0006 and `upgrade head → downgrade -1 → upgrade head` pass in disposable databases.
- `python -m backend.ops.check_accuracy --ci` — 8/8 sample-data cases against configured model, disposable account cleaned up.
- Frontend Docker build passes with patched dependencies. Runtime npm audit reports zero known advisories; 12 moderate build-tool advisories remain.
- Four-process lock/quota contention and a local backup/restore drill passed.

Live browser click-through remains unverified. An owner-authorized Gmail test was received, but Gmail publishing/ownership verification is deferred and is not a release dependency. Browser access is disabled in the current environment. The sample-data accuracy result does not establish accuracy on unfamiliar customer schemas.

## Release blockers — keep draft

- Save EMAIL_VERIFICATION_REQUIRED=false and MAIL_TRANSPORT=disabled on the existing Render service before deployment. This overrides the previously pending Gmail transport; no Google verification is required for this release.
- Back up and inspect the existing Supabase app schema/Alembic revision; configure compatible direct/session URLs, least-privilege roles and provider CA files if needed. Local configured hostnames failed DNS, so live database state is unverified.
- Preserve existing JWT/encryption secret. Deploy matching backend/frontend together after prerequisite settings are ready; both services auto-deploy from main.
- Owner explicitly chose to retain 17 legacy workflow threads with old key records. No cleanup is authorized or performed. This remains production-readiness work, together with retention/rotation planning.
- Migration/startup checkpoint identity remains migration-capable. Separate privileged bootstrap from runtime access before a broader public release.

## Checklist

- [ ] Remote CI is green (not yet run for this release PR).
- [x] Local lint, unit tests and frontend build pass.
- [x] New security behavior has regression coverage.
- [x] App data routes retain authentication and owner filters.
- [x] Matching migrations are included; rollback/reapply checked on disposable data.
- [x] Staged content checked against local secret values; no matches.
- [ ] Browser screenshots and production smoke checks complete.

## Breaking changes

- Migration 0003 records email ownership as unverified. The explicit password-only release configuration permits sign-in without changing that ownership status; default verification mode remains available for a later mail-enabled release.
- Review requests require the single-use token from the displayed SQL proposal. Old pending proposals require a new question.
- Shared demo access and file email are disabled in production.
- Generated Python execution is disabled; SQL results and narrative answers remain available.
- Customer schema discovery no longer samples rows automatically; questions, approved result rows, schema and uploaded references still go to the model provider and workflow state remains persisted.

## Security impact and limits

SQL is checked recursively, functions are allowlisted, result rows are SQL-limited, and source sessions use verified TLS/read-only defaults/timeouts. Database grants remain the permission boundary. Operator-supplied CA files never disable certificate/hostname verification. Decrypted model keys are resolved outside new checkpoint state; historical checkpoints are not retroactively sanitized.

The worst-case impact of a defect in these paths includes unauthorized database access, credential/result disclosure or account compromise. Passing tests is not a full security audit, and remaining deployment/retention/email limits above are intentional merge blockers rather than verified production guarantees.
