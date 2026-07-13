# SQL Data Cockpit

An autonomous **Natural Language to SQL analytics agent** built on a **LangGraph state machine** with defense-in-depth security, Human-in-the-Loop (HITL) checkpointing, and a real-time streaming UI.

[![CI](https://github.com/ombrdr47/sql-data-cockpit/actions/workflows/ci.yml/badge.svg)](https://github.com/ombrdr47/sql-data-cockpit/actions/workflows/ci.yml)

---

## Architecture

```
User (React/Vite)
    │  SSE stream: reasoning • token • table • chart • approval_required
    ▼
FastAPI  (/chat/stream → StreamingResponse)
    │
    ▼
LangGraph State Machine  (7 nodes, PostgresSaver checkpointer)
 ┌──────────────────────────────────────────────────────┐
 │  classify_intent → prune_schema → generate_sql      │
 │       ↓                                              │
 │  validate_sql (sqlglot AST guard)                    │
 │       ↓ HITL pause                                   │
 │  human_review ──approved──► execute_sql             │
 │       ↑   ↑                      ↓                  │
 │  retry loop (max 3)         python_viz (sandbox)     │
 │                                   ↓                  │
 │                             synthesize_answer        │
 └──────────────────────────────────────────────────────┘
    │
    ▼
PostgreSQL (Render)
 ├── chinook DB   — 11 analytics tables (chinook_ro role, SELECT-only)
 └── app_db       — users • conversations • messages • checkpoints
```

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| LLM | Groq `llama-3.3-70b-versatile` | Sub-second inference; swappable to any LangChain model |
| Agent Framework | LangGraph 0.2 | Explicit state machine with typed `AgentState`, deterministic retry loops |
| Checkpointing | `AsyncPostgresSaver` (psycopg3 pool) | Durable mid-graph state → survives pod restarts, enables HITL |
| SQL Security | `sqlglot` AST parser | Rejects DDL/DML/multi-statements before any DB round-trip |
| Backend | FastAPI + Uvicorn + asyncpg | Fully async, zero blocking calls under concurrent load |
| Auth | JWT (HTTP-only cookies) + bcrypt | Access token in-memory; refresh token in `SameSite=None; Secure` cookie |
| Analytics DB isolation | PostgreSQL role `chinook_ro` | Role cannot INSERT/UPDATE/DELETE even if AST guard is bypassed |
| Python viz sandbox | `subprocess` + `RLIMIT_CPU` + `RLIMIT_AS` | OS-enforced CPU & memory caps; `os`, `sys`, `subprocess` builtins removed |
| Frontend | React 18 + Vite + TypeScript | |
| Streaming | Server-Sent Events (SSE) | Live chain-of-thought: reasoning steps, SQL, data tables, base64 charts |
| CI/CD | GitHub Actions + Docker multi-stage | Lint → 109 tests → frontend build on every push |
| Deploy | Render (backend Docker) + Vercel (frontend) | |

---

## LangGraph Node Details

| Node | Responsibility | Key Logic |
|---|---|---|
| `classify_intent` | Decides if question is answerable from the Chinook schema | Returns `CANNOT_ANSWER` early to avoid wasted SQL attempts |
| `prune_schema` | Selects only relevant tables from the 11-table schema | Reduces token usage; prevents cross-schema leakage |
| `generate_sql` | LLM generates a `SELECT` statement | Receives pruned schema + conversation history |
| `validate_sql` | `sqlglot` AST parse + allowlist check | Blocks DDL, DML, semicolons, subquery injection |
| `human_review` | **HITL interrupt** — pauses graph execution | Streams `approval_required` SSE event; state saved to Postgres |
| `execute_sql` | Runs query via `chinook_ro` role | Row cap enforced at application layer + DB-level statement timeout |
| `python_viz` | Generates charts in isolated subprocess | Returns base64-encoded PNG; sandbox prevents host access |
| `synthesize_answer` | Converts raw results to markdown answer | Streams tokens via `token` SSE events |

The graph uses a **retry edge**: if `execute_sql` raises an exception, the state machine loops back to `generate_sql` with the error context appended. Maximum 3 retries per question.

---

## Security Design

**1 — No wildcard CORS with credentials.**
The `CORSMiddleware` uses `allow_origin_regex=r".*"` with a filtered origins list (wildcard `*` excluded), so Starlette always echoes the exact caller `Origin` back. Required by the W3C spec when `withCredentials: true`.

**2 — JWT stored in memory, refresh in HTTP-only cookie.**
The access token never touches `localStorage`. After a page reload, the client silently hits `/auth/refresh` to get a new access token from the `HttpOnly; SameSite=None; Secure` refresh cookie. A single interceptor handles 401 → refresh → retry without infinite loops.

**3 — Two-database isolation.**
The LLM executes SQL through `chinook_ro` (a PostgreSQL role with `NOINHERIT`, connected to the `chinook` database only). The app schema (`users`, `conversations`, `checkpoints`) lives in a separate database; the LLM has zero visibility into it.

**4 — OS-level sandbox for Python visualization.**
```python
resource.setrlimit(resource.RLIMIT_CPU, (5, 5))     # 5s CPU hard cap
resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, ...))  # 512 MB RAM
```
Builtins `__import__`, `open`, `exec`, `eval`, `compile` are removed from the execution namespace.

---

## Connection Pool Sizing

The `AsyncPostgresSaver` uses an `AsyncConnectionPool` (psycopg3), **not** the single-connection `from_conn_string()` shortcut. Pool parameters are configurable via env vars:

```
CHECKPOINTER_POOL_MIN=5   # keep-alive connections
CHECKPOINTER_POOL_MAX=20  # burst capacity for ~100 concurrent users
```

Formula: `max ≈ avg_concurrent_users × avg_graphs_per_second × avg_node_latency_s`

---

## Running Tests

```bash
# Inside the running dev container
docker exec -e PYTHONPATH=/app text2sql_backend pytest backend/tests/ -v

# Categories
#   test_sql_validation.py   — AST guard unit tests (DDL/DML/injection)
#   test_hitl_nodes.py       — HITL state isolation + approval flow
#   test_auth_router.py      — JWT issue, refresh, revoke
#   test_red_team.py         — Prompt injection & sandbox escape attempts
#   test_integration.py      — Full graph: classify → generate → execute → synthesize
```

109 tests, ~12s runtime.

---

## Quick Start

```bash
# 1. Set secrets
export GROQ_API_KEY="gsk_..."

# 2. Run full stack
docker compose up -d --build

# 3. Open
#   Frontend: http://localhost:3000
#   API docs:  http://localhost:8000/docs
```

On first start, Docker runs `init_app_db.sql`, `Chinook_PostgreSql.sql`, and `init_readonly_role.sql` automatically.
