## What changed

<!-- 1–3 sentences. What does this PR do? -->


## Why

<!-- Context, issue reference, or user-facing reason. -->
<!-- Link issues with: Closes #123 -->


## How to test

<!-- Steps a reviewer can follow to verify the change manually. -->
<!-- If UI: describe which page / flow to use. -->
<!-- If backend-only: describe the curl / test to run. -->


## Checklist

### General
- [ ] CI is green (lint + tests + build all pass)
- [ ] New behaviour has corresponding tests
- [ ] No `console.log` / `print` debug statements left in

### Backend (if applicable)
- [ ] New endpoints use `Depends(get_current_user)` or a stricter guard
- [ ] User-scoped data filters on `current_user.id`
- [ ] Sensitive fields are encrypted before DB write, never returned in responses
- [ ] Ruff lint passes: `ruff check --config pyproject.toml backend/`

### Frontend (if applicable)
- [ ] `npx tsc -b --noEmit` — zero TypeScript errors
- [ ] API 4xx/5xx errors are caught and shown to the user
- [ ] Loading and empty states are handled

### Database / schema (if applicable)
- [ ] `models.py` change has a matching Alembic migration in `migrations/versions/`
- [ ] `downgrade()` is implemented (not `pass`)
- [ ] Tested locally: `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head`
- [ ] New columns have `nullable=True` or `server_default` to avoid deploy failures

### Security-sensitive (if applicable)
> Complete this section if the change touches: auth, encryption, BYODB connections,
> SSRF guards, demo account permissions, or the SQL execution path.

- [ ] Described the attack vector this change affects:  
  <!-- _e.g. "Prevents demo users from creating connections that other demo sessions could access"_ -->
- [ ] Worst-case impact if this has a bug:  
  <!-- _e.g. "Cross-session credential exposure"_ -->
- [ ] How I verified it's correct:  
  <!-- _e.g. "Unit tests in TestDemoAccountGuard cover blocked, allowed, and edge cases"_ -->

## Breaking changes

<!-- Does this change any existing API contract, URL, or user-facing behaviour? -->
<!-- If yes: describe what breaks and how consumers should adapt. -->
<!-- If no: write "None" -->


## Screenshots / recordings (UI changes)

<!-- Drop screenshots or a screen recording here. Delete section if not applicable. -->
