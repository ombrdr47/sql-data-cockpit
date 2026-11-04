# Authentication hardening — 31 October 2026

## Implemented

- Removed the wildcard credentialed CORS override. Only configured frontend origins are allowed.
- Authentication writes reject untrusted Origin headers. Cookie-authenticated writes require an explicitly allowed Origin; native API clients without cookies can still authenticate.
- Refresh cookies now cover `/auth`, so browsers send them to logout. Successful authentication/refresh removes the legacy `/auth/refresh` cookie; logout clears both paths and revokes the received refresh token.
- Refresh token selection takes a PostgreSQL row lock, preventing concurrent requests from both rotating the same token.
- All frontend refresh callers share one pending refresh request. Invalid login/password requests no longer trigger automatic session refresh.
- Clear React Query caches on sign-in, sign-up, sign-out, and expired sessions to prevent previous-account data appearing after switching users.
- Unknown-account login performs bcrypt verification against a dummy hash. Login failures retain the generic email/password error.
- Reject passwords beyond bcrypt's 72-byte limit instead of silently truncating them. Existing minimum remains eight characters; passwords are not trimmed.
- Malformed token subjects return 401 rather than a server error. JWT decoding errors no longer expose internal details.
- Auth responses use no-store. Auth endpoints throttle requests by direct client IP: ten attempts/minute for login, signup, and password changes; sixty/minute for refresh.
- Shared demo users cannot change the password, replace/delete the API key, or update database credentials.
- Production configuration refuses short/default signing secrets and wildcard/non-HTTPS frontend origins.

## Deployment requirements and remaining work

This is a targeted hardening pass, not a complete security audit or certification.

- The limiter is bounded and in-process. Multiple workers/instances require shared Redis or gateway enforcement. The app does not trust arbitrary X-Forwarded-For headers; configure trusted proxy handling at deployment. Shared NAT users share the same IP budget.
- Password changes and resets now increment a server-side session version, immediately rejecting old access JWTs and revoking refresh tokens. Logout alone revokes its refresh token; its access JWT still expires normally (15 minutes by default).
- Email verification and single-use expiring password recovery are implemented; see EMAIL_SETUP.md. Local mail previews are configured, but no real SMTP provider is connected. MFA/passkeys and a device/session management UI remain future work.
- Refresh replay is rejected, but token-family-wide replay revocation is not implemented.
- Existing browsers with the old narrow cookie should refresh or sign in once to migrate its path. A logout before migration clears that legacy cookie but cannot revoke a token the browser did not send.
- Use HTTPS, exact ALLOWED_ORIGINS, a strong random JWT_SECRET_KEY, and production environment configuration. Do not rotate the existing secret casually: it also derives encryption keys for stored database credentials and API keys; separate encryption-key management needs a planned migration.
- Dedicated read-only database roles remain essential. Network isolation, SSRF defenses in database connectors, SQL safety, dependency scanning, and deployment headers warrant a separate audit.
- Shared demo conversations are shared data, not a private workspace. Use only sample data in that account.

## Validation

Run `backend/.venv/bin/python -m pytest backend/tests/test_auth_security.py backend/tests/test_auth.py backend/tests/test_connections.py -q` and `npm run build --prefix frontend`.

Results: 48 targeted tests passed; frontend production build passed. Live local API checks verified login, exactly one successful concurrent refresh, replay rejection, logout revocation, rejected untrusted origins, restricted CORS, and blocked demo password changes. Browser interaction checks were not performed.

Guidance: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html and https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html.
