# Gmail delivery on Render Free

Approved sender: `omb4027@gmail.com`. Both Render and Vercel deploy from `main`.

The backend now supports `MAIL_TRANSPORT=gmail_api` over HTTPS. Render Free blocks Gmail SMTP ports 465/587, so an app password will not solve this deployment's network restriction. No Google account authorization or real email delivery has happened yet.

## Owner setup in Google Cloud

1. Sign in to https://console.cloud.google.com/ using the account that owns the sender. Create or select a project for SQL Cockpit and enable **Gmail API** under APIs & Services.
2. Open **Google Auth Platform**. Configure Branding and Audience for this project, using your own support/contact details. For initial testing, select External and add `omb4027@gmail.com` as a test user.
3. In Data Access, request only `https://www.googleapis.com/auth/gmail.send`. This sends messages and does not request inbox-reading permission. Google classifies it as a sensitive scope; follow the publishing/verification requirements applicable to your use.
4. Create an OAuth client of type **Web application**. Add this exact authorized redirect URI: `http://localhost:8765/`. This callback is used only by the one-time local operator helper; it is not an application login route.
5. Download the OAuth client JSON and save it locally as `backend/.local/gmail-client.json`. That directory is ignored by Git and Docker. Do not paste the file or its values into chat.
6. From the repository root, run the owner authorization helper:

```sh
uv run --no-project --with-requirements backend/ops/gmail-requirements.txt python -m backend.ops.authorize_gmail --client-file backend/.local/gmail-client.json --sender omb4027@gmail.com
```

The helper opens Google's consent page on your computer. Sign in as the sender and review the send-only permission. It uses Google's OAuth library with state validation and PKCE. Google account verification, consent, and any publishing/review steps are owner actions. This helper does not send an email.

After successful consent, it writes `backend/.local/gmail-render-secrets.json` with file permissions 0600. It does not print the credentials and refuses to overwrite an existing output file. A refresh token authorizes sending from your account; keep this file private.

## Enter values privately in the existing Render service

In the backend service's Environment page, add the values from the generated private JSON:

```text
MAIL_TRANSPORT=gmail_api
MAIL_FROM=SQL Cockpit <omb4027@gmail.com>
GMAIL_CLIENT_ID=<from private file>
GMAIL_CLIENT_SECRET=<from private file>
GMAIL_REFRESH_TOKEN=<from private file>
FRONTEND_URL=https://sql-data-cockpit.vercel.app
ALLOWED_ORIGINS=https://sql-data-cockpit.vercel.app
```

These are backend environment values. Do not put them in Vercel `VITE_` variables. Preserve the existing JWT/encryption secret. The old deployed backend does not support `gmail_api`; add these as part of the coordinated release of the updated backend, not as an isolated mail-transport switch on the old version.

## Before merging the release

- Google **Testing** status normally produces a refresh token that expires in seven days for Gmail scopes. It is appropriate only for the initial delivery test. Resolve the OAuth publishing/verification requirements and issue the lasting authorization before relying on production account verification. Publishing does not guarantee a token will never expire or be revoked.
- Confirm that the backend can refresh the authorization and send a real verification/reset email to an account you control. Current tests mock Google's endpoints; they do not prove real inbox delivery.
- Gmail quotas, anti-abuse controls and credential revocation still apply. The app deliberately does not retry an ambiguous send timeout, to avoid sending duplicates; users can request a fresh link after cooldown. A durable delivery queue/monitoring remains work before larger-scale use.
- Keep the release off `main` until the required secrets, migration backup, and sender authorization are ready. Merging triggers your existing automatic deployments, and existing personal users will need verification after the migration.

## Official references

- Gmail API sending and raw MIME encoding: https://developers.google.com/workspace/gmail/api/guides/sending
- Gmail scopes: https://developers.google.com/workspace/gmail/api/auth/scopes
- OAuth consent setup: https://developers.google.com/workspace/guides/configure-oauth-consent
- OAuth refresh-token expiration: https://developers.google.com/identity/protocols/oauth2#expiration
- Render Free SMTP restrictions: https://render.com/docs/free
