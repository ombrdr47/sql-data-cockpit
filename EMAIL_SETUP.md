# Email verification and password recovery

## Local development

Email is currently delivered to private `.eml` files under `backend/.local/mail/`, not to real inboxes. This folder is ignored by Git, individual files use mode 0600, and the API does not serve them. Open the newest file in an email client or editor to follow its verification/reset link. Some editors show MIME quoted-printable wrapping; an email client decodes it correctly.

- Sign up at http://localhost:5173/signup. Open the verification email preview and click its link, then press **Verify email**. Sign in normally afterward.
- Existing personal accounts also need verification. Attempt sign-in, then use **Send verification email** on the verification page.
- Use **Forgot your password?** from sign-in to request a reset. The reset preview contains a 30-minute link. Submit a new password, then sign in again.
- The shared demo account stays verified and cannot request password resets.
- Resends have a 60-second per-account/purpose cooldown. A new issued link replaces older links for that purpose.
- File previews contain secrets. Do not publish or commit them. Delete old previews when finished.

## Approved Render Free deployment

The sender is `omb4027@gmail.com`. Use the new **Gmail API over HTTPS**, following [GMAIL_SETUP.md](GMAIL_SETUP.md). Gmail SMTP is blocked by Render Free, and an address alone is not sending authorization. The owner must create OAuth credentials and grant the send-only scope. Mocked delivery tests pass; real delivery is not yet verified.

## Optional SMTP on a compatible host

Configure these through your deployment secret store (or a local ignored `.env`), then recreate the API container so environment changes take effect:

```
ENVIRONMENT=production
FRONTEND_URL=https://your-frontend.example
ALLOWED_ORIGINS=https://your-frontend.example
MAIL_TRANSPORT=smtp
MAIL_FROM=SQL Cockpit <accounts@your-verified-domain.example>
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_STARTTLS=true
SMTP_USERNAME=your-smtp-user
SMTP_PASSWORD=your-secret
```

Use a verified sending domain and provider-managed SPF/DKIM/DMARC. Production startup refuses file mail, incomplete Gmail authorization, non-TLS SMTP, or a non-HTTPS frontend URL. This implementation uses STARTTLS (commonly port 587), not implicit TLS on port 465. Actual delivery has not been tested because no provider is configured.

The Compose file forwards the mail settings. Set `ENVIRONMENT=production` for deployment; its default is development. Preserve the current JWT/encryption secret during deployment.

## Database deployment

Apply Alembic migration `0003` before restarting the API. The existing application role needs SELECT/INSERT/UPDATE/DELETE on `account_tokens` when migrations run under a different table owner. Existing personal accounts are deliberately unverified; no ownership proof is fabricated. Only `demo@chinook.dev` is exempt.

## Security and limits

Tokens are random, hashed in the database, bound to one purpose, expire after 24 hours (verification) or 30 minutes (reset), and are consumed atomically. GET requests/email scanners do not consume them. Tokens travel in a URL fragment; the UI removes it and sends it only in the confirmation POST body.

Password reset does not automatically verify email or sign the user in. It revokes all refresh sessions and increments the session version so old access tokens fail immediately. Password changes also invalidate outstanding reset links. Logout alone still allows an existing access JWT to expire naturally.

Forgot-password and resend endpoints always return the same message, with lookup/delivery after the response. Background tasks are process-local, not a durable queue: a restart can interrupt delivery; the user can retry. SMTP errors log a generic operational message without account addresses or tokens. Production needs delivery monitoring and a durable mail queue before significant scale. The current rate limiter is per worker; use shared edge/Redis limits for multiple instances.
