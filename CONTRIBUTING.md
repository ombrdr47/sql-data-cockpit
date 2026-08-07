# Contributing to SQL Data Cockpit

Thank you for contributing! This document is the **authoritative checklist** for
every code change — from a one-line fix to a major feature. CI enforces the
mechanical parts; this document covers the reasoning and context that CI cannot.

---

## Table of Contents

1. [Branch naming](#1-branch-naming)
2. [Pre-commit checklist](#2-pre-commit-checklist)
3. [Backend changes](#3-backend-changes)
4. [Frontend changes](#4-frontend-changes)
5. [Security-sensitive changes](#5-security-sensitive-changes)
6. [Database / schema changes](#6-database--schema-changes)
7. [CI gates](#7-ci-gates)
8. [Pull request rules](#8-pull-request-rules)
9. [Deployment](#9-deployment)

---

## 1. Branch naming

| Type | Pattern | Example |
|---|---|---|
| Feature | `feat/<short-description>` | `feat/schema-annotations` |
| Bug fix | `fix/<short-description>` | `fix/hitl-reject-spinner` |
| Refactor | `refactor/<short-description>` | `refactor/engine-pool-ttl` |
| Chore | `chore/<short-description>` | `chore/update-deps` |

All changes must be merged to `main` via a pull request. Direct pushes to `main`
are only permitted for **emergency hotfixes** — and must be followed by a
retroactive PR for review record.

---

## 2. Pre-commit checklist

Run this before every commit. CI will catch failures, but catching them locally
is faster and cheaper.

```bash
# Backend — lint + tests
cd backend
ruff check --config ../pyproject.toml .
python -m pytest tests/ -v --tb=short

# Frontend — type check + build
cd frontend
npx tsc -b --noEmit
npm run build
```

> [!IMPORTANT]
> Every new behaviour must have a corresponding test. PRs that add code paths
> without tests will be rejected.

---

## 3. Backend changes

### 3a. Adding a new endpoint

- [ ] Route is registered in `main.py` via `include_router`
- [ ] Authentication: uses `Depends(get_current_user)` or a stricter guard
- [ ] Authorization: any user-scoped data filters on `current_user.id`
- [ ] Input validated with a Pydantic model — no raw `dict` payloads
- [ ] Sensitive fields (passwords, host, database) are encrypted via `crypto.encrypt_field` before DB write
- [ ] Sensitive fields are **never** returned in responses
- [ ] New endpoint has at least one passing test in `backend/tests/`

### 3b. Modifying auth / user guards

> [!CAUTION]
> Auth changes are the highest-risk category. A mistake here can expose every
> user's data. Do not proceed unless you have:

- [ ] Identified **every** endpoint the guard applies to
- [ ] Written tests for: blocked user, allowed user, edge cases (e.g. case sensitivity)
- [ ] Confirmed no existing test breaks
- [ ] Run the full test suite, not just the new tests

### 3c. Adding a dependency guard (`Depends(...)`)

When writing a new FastAPI dependency that restricts access (like `_require_non_demo`):

- [ ] The guard raises `HTTPException` with the correct status code (`403` for authorization, `401` for auth)
- [ ] The error `detail` is human-readable and doesn't leak internal state
- [ ] The guard is applied at the **endpoint level**, not globally, unless intentional
- [ ] Tests cover: user blocked, user allowed, edge cases

### 3d. Modifying the demo account

The demo account (`demo@chinook.dev`) is a shared public credential. Any change
that touches its permissions or data scope requires extra scrutiny:

- [ ] What do existing demo sessions see before the change?
- [ ] What will they see after?
- [ ] Does the change affect regular (non-demo) users in any way?
- [ ] Is the change additive-only (preferred) or does it remove existing behaviour?

---

## 4. Frontend changes

### 4a. TypeScript

- [ ] `npx tsc -b --noEmit` reports zero errors
- [ ] No `any` types introduced unless absolutely necessary and commented
- [ ] New shared types go in the relevant component's file (e.g. `MessageBubble.tsx`) or `lib/`

### 4b. UI / UX

- [ ] New UI states have loading, error, and empty states — not just the happy path
- [ ] API error responses (4xx/5xx) are caught and shown to the user — not swallowed silently
- [ ] New interactive elements have unique `id` attributes for testability

### 4c. API contract

- [ ] Any new backend response field is typed in `lib/api.ts`
- [ ] Any removed or renamed field is updated in all consuming components
- [ ] 4xx error codes from new backend guards are handled in the frontend (e.g. 403 → show upgrade prompt)

---

## 5. Security-sensitive changes

> [!WARNING]
> The following areas require explicit security review before merging:

| Area | Risk |
|---|---|
| Auth token generation / validation | Account takeover |
| Encryption key handling | Credential exposure |
| BYODB connection credentials | Data breach |
| SSRF protection (`_assert_not_internal`) | Internal infra exposure |
| Demo account permissions | Cross-session data leakage |
| SQL execution path | Injection / data exfiltration |

For changes in these areas, include in your PR description:
1. What attack vector does this change affect?
2. What is the worst-case impact if this change has a bug?
3. How did you verify it's correct?

---

## 6. Database / schema changes

This project uses **Alembic** for schema versioning. Never apply raw SQL to
production manually — always go through a migration.

### Workflow

```bash
cd backend

# 1. Edit app/models.py with your changes

# 2. Generate a new migration (autogenerate from models diff)
alembic revision --autogenerate -m "add column_metadata table"

# 3. Review the generated file in migrations/versions/
#    Autogenerate is not perfect — check:
#    - Correct table/column names
#    - Correct types and constraints
#    - downgrade() correctly reverses upgrade()

# 4. Test locally (requires APP_DB_SYNC_URL env var)
alembic upgrade head
alembic downgrade -1   # verify rollback works
alembic upgrade head   # re-apply

# 5. Commit the migration file alongside the model change
git add app/models.py migrations/versions/<new_file>.py
```

> [!IMPORTANT]
> The Dockerfile runs `alembic upgrade head` before starting uvicorn on every
> deploy. A bad migration will fail the deploy and prevent the service from
> starting. Always test the migration locally before merging.

### Rules

- [ ] Every `models.py` change has a corresponding Alembic migration
- [ ] Migration file is committed in the same PR as the model change
- [ ] `downgrade()` is implemented (not left as `pass`)
- [ ] Migration tested locally with upgrade + downgrade + upgrade

---

## 7. CI gates

The following must pass on every PR before merge:

| Gate | What it checks |
|---|---|
| **Ruff lint** | Python style, unused imports, type annotations |
| **Backend unit tests** | All tests in `backend/tests/` |
| **Frontend TypeScript** | `tsc -b --noEmit` zero errors |
| **Frontend build** | `npm run build` succeeds |

The **eval job** (SQL generation accuracy) runs only on push to `main`. It
requires the `GROQ_API_KEY` secret and is informational — it does not block
merge, but a significant regression should be investigated before release.

---

## 8. Pull request rules

### PR title format

```
<type>(<scope>): <short description>

Examples:
feat(connections): block BYODB creation for demo account
fix(sidebar): delete button overlaps conversation title
chore(deps): bump alembic to 1.16.1
```

### PR description must include

- [ ] **What changed**: 1–3 sentence summary
- [ ] **Why**: context or issue reference
- [ ] **How to test manually** (if applicable): steps a reviewer can follow
- [ ] **Breaking changes**: anything that changes existing API contracts or user-facing behaviour

### Review requirements

- At least **1 approval** required before merge
- PRs touching [security-sensitive areas](#5-security-sensitive-changes) require explicit sign-off
- No self-merges unless it's a trivial chore (dependency bump, typo fix)

---

## 9. Deployment

Deployment is automatic via Render (backend) and Vercel (frontend) on push to `main`.

### Before merging to main

- [ ] CI is fully green (all jobs passing)
- [ ] Any Alembic migration has been reviewed (Render runs `upgrade head` on boot)
- [ ] Environment variables for new config keys have been added to Render / Vercel dashboards
- [ ] If a new `render.yaml` env key was added, it has been set in the Render dashboard

### After deployment

- [ ] Check Render deploy logs — look for `alembic upgrade head` success
- [ ] Hit `GET /health` on the production backend
- [ ] Smoke test the changed feature manually on the deployed URL

---

## Common mistakes to avoid

| Mistake | Consequence | Prevention |
|---|---|---|
| Returning encrypted fields in API responses | Credential exposure | Always use `_mask()` / `_to_response()` |
| Using `current_user.id` from a stale reference | TOCTOU bugs | Fetch fresh from DB in each request |
| Changing `DEMO_EMAIL` without updating tests | Guard bypass | `TestDemoAccountGuard::test_demo_email_constant_is_correct` |
| Skipping `alembic downgrade` test | Broken rollback | Always test both directions |
| Merging a migration without the model change | Schema drift | Commit both in the same PR |
| Adding new columns without NULL default | Deploy fails if rows exist | Always add `nullable=True` or `server_default` |
