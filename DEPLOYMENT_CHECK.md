# Existing deployment check — 2026-11-04

Read-only public HTTP inspection and local configuration review. No remote credentials were submitted to the API, and no remote settings, records, accounts or deployments were changed.

| Check | Observed result |
| --- | --- |
| Vercel frontend | HTTP 200 at `https://sql-data-cockpit.vercel.app/` |
| Render API health | HTTP 200, status `ok`, version `2.1.0` |
| Public frontend API target | Matches `https://sql-data-cockpit-backend.onrender.com` |
| New verification/reset routes in deployed OpenAPI | Absent |
| Saved analysis route in deployed OpenAPI | Absent |
| Required single-use review token in deployed schema | Absent |
| New review token / verification route in public frontend bundle | Absent |
| Expected frontend CORS preflight | 200, exact frontend origin allowed, credentials enabled |
| Untrusted-origin CORS preflight | **200, untrusted origin reflected, credentials enabled** |
| Local Supabase URL mode | Both projects use direct hostnames, port 5432 |
| Local read-only Supabase transport/schema probes | Hostname resolution failed; no schema/permission check completed |

## Release implication

The live interface lacks the recent local authentication, saved-analysis and approval changes. The version string alone cannot identify a commit because it was not advanced during local hardening. The two public artifacts are consistent with an older deployed version; no exact deployed Git SHA was retrieved.

The live CORS result is a confirmed configuration weakness: an unrelated browser origin receives a credentialed allow-origin response. These checks did not obtain a token or exploit an authenticated session. The security impact depends on cookie/session behavior, but this should be corrected before inviting testers.

Deploy the reviewed local backend and matching frontend together. Configure Render `ALLOWED_ORIGINS` and `FRONTEND_URL` as `https://sql-data-cockpit.vercel.app`. The local backend removes wildcard CORS and guards auth origins. Check that the matching code is deployed as well as environment values; changing an environment variable alone may not remove the older code's wildcard behavior.

Repeat the trusted/untrusted OPTIONS checks after deployment; expect the frontend to remain allowed and the untrusted origin to receive no `Access-Control-Allow-Origin` header. Then exercise real browser login/refresh and SQL approval. These require access to the actual Render/Vercel deployment configuration, which was unavailable through connected tools/browser access.

Supabase connectivity from this machine failing DNS does not prove a database outage, and local `.env` values may be stale. Compare them privately with the existing Render environment and each project's Connect panel. Keep existing data and encryption secrets intact. Use a compatible direct/session connection and a provider CA when required; never turn off certificate verification.
