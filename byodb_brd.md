# BRD — Bring Your Own Database (BYODB)

## 1. Overview
Chinook Data Cockpit currently answers natural-language questions against one fixed, hardcoded demo dataset (Chinook). BYODB extends the product so any authenticated user can connect their own PostgreSQL database and ask natural-language questions against their own schema and data — while the Chinook dataset remains permanently available as a zero-setup demo.

## 2. Problem Statement
Today the product can only prove its value against a curated sample dataset. It cannot demonstrate whether the underlying agent generalizes to schemas it wasn't purpose-built for. This limits the product to being "a demo," not "a tool," and limits how convincingly it can show real capability to a prospective user, employer, or collaborator.

## 3. Goals
- Let any authenticated user connect a PostgreSQL database of their own and run natural-language questions against it, using the same agent capability that currently powers Chinook.
- Preserve the current Chinook demo experience exactly as it works today, for users who never touch BYODB.
- Make it unambiguous, at all times, which data source a given conversation is targeting.
- Guarantee a user's own data and credentials are never exposed to another user, never logged, and can only ever be queried read-only — regardless of what permissions the underlying database role actually has.

## 4. Out of Scope (v1)
- Database engines other than PostgreSQL (MySQL, SQLite, BigQuery, etc.)
- Any write operation (INSERT / UPDATE / DELETE / DDL) against any connected database
- Real-time sync or streaming ingestion — this is query-on-demand only
- Sharing a single connected database across multiple user accounts
- Databases only reachable via VPN or SSH tunnel

## 5. User Personas
- **Evaluator** — a recruiter or interviewer trying the product for the first time. Must be able to see it work with zero setup, no credentials required.
- **Owner** — a user who wants to point the tool at a real database they control and get real answers about real data.

## 6. User Stories
- As a new user, I want to try the product immediately with no credentials, so I can see what it does before committing to anything.
- As a returning user, I want to connect my own PostgreSQL database so I can ask questions about my own data.
- As a user with more than one database, I want to save multiple connections and choose which one a given conversation targets.
- As a user, I want to know *before* I start querying whether my connection is valid, reachable, and readable.
- As a user, I want confidence that connecting my database can never result in my data being modified, deleted, or exposed to anyone else.
- As a user, I want to remove a saved connection at any time, with my credentials fully and permanently deleted.

## 7. Functional Requirements

| ID | Requirement |
|---|---|
| FR-1 | Users can add a new database connection by providing host, port, database name, username, and password (or a full connection string). |
| FR-2 | Before a connection is saved, the system tests it and reports clear success/failure with a reason (unreachable, authentication failed, etc.). |
| FR-3 | Users can view their list of saved connections, see each one's name and status, and delete any of them. |
| FR-4 | Every conversation is associated with exactly one data source — either the built-in Chinook demo or one of the user's saved connections — and this is visibly shown for that conversation. |
| FR-5 | When starting a new conversation, Chinook demo is pre-selected by default; the user's own connections are also selectable. |
| FR-6 | The natural-language-to-SQL agent behaves identically regardless of which connection is selected — no reduced functionality or separate logic path for BYODB vs. demo. |
| FR-7 | All query execution against any connected database is strictly read-only, regardless of what permissions the supplied credentials actually carry. |
| FR-8 | The system never allows a connection to target the application's own internal infrastructure. |
| FR-9 | A user's saved credentials are never visible to any other user, never appear in logs or error messages, and are never stored in a plainly readable form. |
| FR-10 | The Chinook demo continues to work exactly as it does today, with zero setup, for any user who never touches BYODB. |
| FR-11 | Deleting a saved connection permanently removes the stored credentials — nothing is retained. |
| FR-12 | The current status of a connection (connected / invalid / unreachable) is clearly shown at the point the user is about to use it, not just at creation time. |

## 8. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 (Security) | Read-only enforcement holds even when the supplied database role technically has write permissions. |
| NFR-2 (Security) | Credentials are encrypted at rest. |
| NFR-3 (Privacy) | One user's connections and data are never visible, queryable, or inferable by another user. |
| NFR-4 (Reliability) | A slow or failing user-connected database never degrades the Chinook demo's performance or availability for other users. |
| NFR-5 (Usability) | The distinction between "demo data" and "your data" is visually unambiguous everywhere in the product, not just at connection setup. |
| NFR-6 (Performance) | Connecting a new database and being ready to query it completes in a reasonable, bounded time. |

## 9. Success Criteria
- A first-time visitor can use the Chinook demo with zero configuration, unchanged from current behavior.
- A returning user can connect a real external PostgreSQL database, see it validated, and get accurate answers to natural-language questions about it.
- Any attempted destructive operation — whether typed directly or generated by the AI — fails at the database level even if the supplied credentials would technically permit it.
- No user can view, query, or detect the existence of another user's connections.
- Deleting a connection leaves zero residual storage of its credentials.

## 10. Constraints & Assumptions
- **Constraint:** v1 supports PostgreSQL only.
- **Constraint:** the connected database must be reachable directly (no VPN/tunnel support in v1).
- **Assumption:** users connecting their own database understand an LLM-generated query will read that data, and should avoid connecting databases containing data they aren't comfortable with an AI system accessing.

## 11. Open Questions
- Should there be a cap on the number of saved connections per user?
- Should connections require periodic re-validation, or expire after inactivity?
- Should users be able to see an audit log of exactly which queries ran against their connected database?
