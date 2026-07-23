"""
app/main.py
FastAPI application entry point.

SSE Chat endpoint — event types:
  {"type": "conversation_id", "conversation_id": "..."}  — emitted immediately
  {"type": "reasoning",  "node": "...", "detail": "..."}  — per-node progress
  {"type": "sql",        "content": "..."}                — validated SQL
  {"type": "approval_required",                           — HITL gate (NEW)
   "sql": "...", "conversation_id": "...", "question": "..."}
  {"type": "table",      "columns": [...], "rows": [...]} — query results
  {"type": "chart",      "content": "..."}                — Plotly JSON
  {"type": "token",      "content": "..."}                — streaming tokens
  {"type": "done",       ...}                             — completion metadata
  {"type": "error",      "content": "..."}                — failure

Review endpoint (HITL resume):
  POST /chat/review/{conversation_id}
  Body: {"approved": true|false, "feedback": "optional rejection reason"}
  Returns: EventSourceResponse (same SSE event format, resumes from checkpoint)
"""
import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Optional
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import get_current_user
from .config import get_settings
from .db import get_appdb_session
from .graph import build_graph
from .memory import (
    add_message,
    auto_title_conversation,
    create_conversation,
    get_conversation,
)
from .models import User
from .routers.auth_router import router as auth_router
from .routers.conversations_router import router as conversations_router
from .routers.connections_router import router as connections_router
from .schema_catalog import get_full_schema_text   # warm-up


# ── Reasoning node labels ──────────────────────────────────────────────────────

NODE_REASONING_LABELS: dict[str, str] = {
    "table_selector":    "🔍 Selecting relevant tables from schema...",
    "generate_sql":      "✍️  Generating SQL query...",
    "validate_sql":      "🛡️  Validating SQL (AST check + schema guard)...",
    "human_review":      "👤 Awaiting your approval before execution...",
    "execute_sql":       "⚡ Executing query...",
    "decide_next_step":  "🧠 Analyzing results — deciding next step...",
    "python_tool":       "🐍 Running Python analysis in isolated sandbox...",
    "synthesize_answer": "💬 Composing final answer...",
    "increment_retry":   "🔄 Self-correcting SQL (retry)...",
}


# ── Lifespan (startup/shutdown) ────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    if settings.langchain_tracing_v2 and settings.langchain_api_key:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
        os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project

    # Warm up schema catalog
    try:
        await get_full_schema_text()
        print("✓ Schema catalog warmed up (dynamic pruning ready)")
    except Exception as e:
        print(f"⚠ Could not warm schema catalog on startup: {e}")

    # Seed the demo user
    try:
        from sqlalchemy.ext.asyncio import AsyncSession as _StartupSession
        from sqlalchemy import select as _select
        from .auth import hash_password as _hash_password
        from .models import User as _User
        from .db import get_appdb_engine as _get_engine

        _engine = _get_engine()
        async with _StartupSession(_engine) as _session:
            _existing = await _session.execute(
                _select(_User).where(_User.email == "demo@chinook.dev")
            )
            if _existing.scalar_one_or_none() is None:
                _demo = _User(
                    email="demo@chinook.dev",
                    username="demo_operator",
                    hashed_password=_hash_password("demo1234"),
                )
                _session.add(_demo)
                await _session.flush()
                await _session.refresh(_demo)
                await _session.commit()
                print("✓ Demo user seeded: demo@chinook.dev / demo1234")
            else:
                print("✓ Demo user already exists")
    except Exception as _e:
        print(f"⚠ Could not seed demo user: {_e}")

    # ── LangGraph checkpointer: connection POOL (scales to hundreds of users) ──
    # Using AsyncConnectionPool instead of from_conn_string() which opens only
    # a single connection and becomes a serialization bottleneck under load.
    try:
        from psycopg_pool import AsyncConnectionPool
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

        pool = AsyncConnectionPool(
            conninfo=settings.app_db_sync_url,
            min_size=settings.checkpointer_pool_min,
            max_size=settings.checkpointer_pool_max,
            open=False,
            kwargs={"autocommit": True, "prepare_threshold": 0},
        )
        await pool.open()
        checkpointer = AsyncPostgresSaver(pool)
        await checkpointer.setup()
        app.state.checkpointer = checkpointer
        app.state.pool = pool
        app.state.graph = build_graph(checkpointer=checkpointer)
        print(
            f"✓ LangGraph checkpointer initialized "
            f"(pool min={settings.checkpointer_pool_min} "
            f"max={settings.checkpointer_pool_max})"
        )

        # ── BYODB engine eviction loop (Bug 3 fix) ─────────────────────────────
        # Evict idle BYODB engines every 60 seconds.
        # Without this the pool grows unboundedly, holding open connections
        # to user databases and leaking memory over time.
        from .engine_pool import engine_pool as _engine_pool

        async def _byodb_eviction_loop():
            while True:
                await asyncio.sleep(60)
                await _engine_pool.evict_expired()

        _eviction_task = asyncio.create_task(_byodb_eviction_loop())
        print("✓ BYODB engine eviction loop started (TTL: "
              f"{settings.byodb_engine_ttl}s, check interval: 60s)")

        yield
        print("Shutting down — closing checkpointer pool...")
        _eviction_task.cancel()
        await pool.close()
        return
    except Exception as e:
        print(f"⚠ Could not initialize checkpointer pool: {e}")
        app.state.checkpointer = None
        app.state.pool = None
        app.state.graph = build_graph(checkpointer=None)

    # Fallback eviction loop (checkpointer init failed but app still runs)
    from .engine_pool import engine_pool as _engine_pool_fallback

    async def _byodb_eviction_loop_fallback():
        while True:
            await asyncio.sleep(60)
            await _engine_pool_fallback.evict_expired()

    _eviction_task_fallback = asyncio.create_task(_byodb_eviction_loop_fallback())

    yield
    print("Shutting down...")
    _eviction_task_fallback.cancel()


# ── App factory ────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Text-to-SQL Agent API",
        description="Natural language to SQL agent over the Chinook music store database.",
        version="2.1.0",
        lifespan=lifespan,
    )

    origins = [o for o in settings.allowed_origins_list if o != "*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=r".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(conversations_router)
    app.include_router(connections_router)

    return app


app = create_app()


@app.get("/", tags=["health"])
@app.head("/", tags=["health"])
async def root():
    return {
        "status": "ok",
        "service": "SQL Data Cockpit v2.0 Backend",
        "docs_url": "/docs",
        "health_url": "/health",
    }


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "text-to-sql-agent", "version": "2.1.0"}


# ── Schemas ────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str
    conversation_id: Optional[str] = None
    # None = Chinook demo; set to a UserConnection UUID for BYODB
    connection_id: Optional[str] = None


class ReviewRequest(BaseModel):
    approved: bool
    feedback: Optional[str] = None


# ── Shared SSE helpers ─────────────────────────────────────────────────────────

def _make_reasoning_detail(node_name: str, node_output: dict) -> str:
    """Build a rich detail string from a node's output dict."""
    detail = NODE_REASONING_LABELS.get(node_name, node_name)

    if node_name == "table_selector":
        selected = node_output.get("selected_tables", [])
        if selected:
            detail = f"🔍 Selected tables: {', '.join(f'`{t}`' for t in selected)}"

    elif node_name == "generate_sql":
        sql = node_output.get("generated_sql", "")
        retry = node_output.get("retry_count", 0)
        detail = (
            f"🔄 Retry #{retry}: Regenerating SQL with error context..."
            if retry > 0
            else "✍️  SQL generated"
        )
        if sql and not sql.upper().startswith("CANNOT_ANSWER"):
            detail += f" ({len(sql)} chars)"

    elif node_name == "execute_sql":
        rows = node_output.get("sql_results")
        cols = node_output.get("sql_columns", [])
        if rows is not None:
            detail = f"⚡ Executed — returned {len(rows)} rows × {len(cols)} columns"
        elif node_output.get("execution_error"):
            detail = f"⚡ Execution error: {node_output['execution_error'][:80]}"

    elif node_name == "validate_sql":
        if node_output.get("sql_valid"):
            detail = "🛡️  SQL validated (AST clean, schema allowlist pass)"
        elif node_output.get("validation_error"):
            err = node_output["validation_error"][:80]
            detail = f"🛡️  Validation failed: {err}"

    elif node_name == "python_tool":
        detail = "🐍 Python analysis complete (isolated sandbox)"

    return detail


async def _stream_graph_events(graph, initial_state_or_command, config: dict):
    """
    Async generator that consumes graph.astream() and yields SSE-formatted
    event dicts. Shared between the initial /chat endpoint and the
    /chat/review/{id} resume endpoint.

    Yields: (event_type, event_dict, final_state)
    The caller is responsible for wrapping in {"event": "message", "data": ...}.
    """
    final_state: dict = {}

    async for event in graph.astream(
        initial_state_or_command,
        config=config,
        stream_mode="updates",
    ):
        # ── HITL interrupt signal ─────────────────────────────────────────────
        if "__interrupt__" in event:
            interrupt_value = event["__interrupt__"][0].value
            yield "approval_required", {
                "type": "approval_required",
                "sql": interrupt_value.get("sql", ""),
                "question": interrupt_value.get("question", ""),
                "conversation_id": interrupt_value.get("conversation_id", ""),
            }, final_state
            return   # Stream ends here — resume via POST /chat/review

        for node_name, node_output in event.items():
            # ── Reasoning event ───────────────────────────────────────────────
            detail = _make_reasoning_detail(node_name, node_output)
            yield "reasoning", {"type": "reasoning", "node": node_name, "detail": detail}, {}

            # ── SQL panel event ───────────────────────────────────────────────
            if node_name == "generate_sql" and node_output.get("generated_sql"):
                sql = node_output["generated_sql"]
                if not sql.upper().startswith("CANNOT_ANSWER"):
                    yield "sql", {"type": "sql", "content": sql}, {}

            # ── Table data event ──────────────────────────────────────────────
            if node_name == "execute_sql" and node_output.get("sql_results"):
                rows = node_output["sql_results"]
                cols = node_output.get("sql_columns") or (
                    list(rows[0].keys()) if rows else []
                )
                yield "table", {
                    "type": "table",
                    "columns": cols,
                    "rows": rows,
                    "total_rows": len(rows),
                }, {}

            # ── Chart event ───────────────────────────────────────────────────
            if node_name == "python_tool" and node_output.get("chart_base64"):
                yield "chart", {
                    "type": "chart",
                    "content": node_output["chart_base64"],
                }, {}

            final_state.update(node_output)

    yield "final", {}, final_state


# ── SSE Chat endpoint ──────────────────────────────────────────────────────────

@app.post("/chat", tags=["chat"])
async def chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    """
    SSE streaming chat endpoint.
    Streams node-by-node reasoning events. Pauses at human_review and emits
    an approval_required event — the stream then ends. Resume via POST /chat/review.
    """
    question = body.question.strip()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question cannot be empty",
        )

    # ── Resolve or create conversation ────────────────────────────────────────
    if body.conversation_id:
        convo = await get_conversation(session, UUID(body.conversation_id), current_user.id)
        if convo is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        conversation_id = str(convo.id)
        is_new_conversation = False
    else:
        convo = await create_conversation(session, current_user.id)
        await session.commit()
        conversation_id = str(convo.id)
        is_new_conversation = True

    await add_message(session, UUID(conversation_id), "user", question)
    await session.commit()

    if is_new_conversation:
        await auto_title_conversation(session, UUID(conversation_id), question)
        await session.commit()

    # ── Resolve BYODB connection ──────────────────────────────────────────────
    # Bug 4 fix: if the client didn't send a connection_id (e.g. page refresh),
    # fall back to the connection_id stored on the conversation record.
    # This ensures follow-up messages always run against the correct database.
    from sqlalchemy import select as _sel
    from .models import UserConnection as _UC, Conversation as _Conv

    effective_connection_id: Optional[str] = body.connection_id

    if not effective_connection_id and not is_new_conversation:
        # Try to restore from the stored conversation record
        _stored = await session.scalar(
            _sel(_Conv).where(_Conv.id == UUID(conversation_id))
        )
        if _stored and _stored.connection_id:
            effective_connection_id = str(_stored.connection_id)

    connection_name: Optional[str] = None
    if effective_connection_id:
        _uc = await session.scalar(
            _sel(_UC).where(
                _UC.id == UUID(effective_connection_id),
                _UC.user_id == current_user.id,
            )
        )
        if _uc is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connection not found or does not belong to you",
            )
        connection_name = _uc.name
        # Persist the connection_id on the conversation record (for new convos
        # or when the client switches datasource mid-session)
        from sqlalchemy import update as _upd
        await session.execute(
            _upd(_Conv)
            .where(_Conv.id == UUID(conversation_id))
            .values(connection_id=UUID(effective_connection_id))
        )
        await session.commit()

    graph = app.state.graph

    return EventSourceResponse(_chat_generator(
        graph, question, conversation_id, str(current_user.id),
        connection_id=effective_connection_id,
        datasource_name=connection_name,
    ))


async def _chat_generator(
    graph,
    question: str,
    conversation_id: str,
    user_id: str,
    connection_id: Optional[str] = None,
    datasource_name: Optional[str] = None,
):
    """Top-level SSE generator for the initial /chat request."""
    yield {
        "event": "message",
        "data": json.dumps({"type": "conversation_id", "conversation_id": conversation_id}),
    }

    initial_state = {
        "question": question,
        "conversation_id": conversation_id,
        "user_id": user_id,
        # BYODB fields — None defaults to Chinook demo
        "connection_id": connection_id,
        "datasource_name": datasource_name,
        "retry_count": 0,
        "node_path": [],
        "sql_valid": False,
        "generated_sql": None,
        "validation_error": None,
        "sql_results": None,
        "sql_columns": None,
        "execution_error": None,
        "needs_python_tool": False,
        "python_output": None,
        "chart_base64": None,
        "final_answer": None,
        "selected_tables": [],
        "hitl_approved": None,
        "hitl_feedback": None,
    }
    config = {"configurable": {"thread_id": conversation_id}}
    final_state: dict = {}

    try:
        async for event_type, event_data, fs in _stream_graph_events(graph, initial_state, config):
            if event_type == "approval_required":
                yield {"event": "message", "data": json.dumps(event_data)}
                return   # Stream ends — frontend waits for user action
            if event_type == "final":
                final_state = fs
                break
            yield {"event": "message", "data": json.dumps(event_data, default=str)}

        # Stream final answer + persist + emit done
        async for evt in _emit_answer_and_done(final_state, conversation_id):
            yield evt

    except Exception as e:
        yield {
            "event": "message",
            "data": json.dumps({"type": "error", "content": f"An error occurred: {e}"}),
        }


# ── HITL Review / Resume endpoint ─────────────────────────────────────────────

@app.post("/chat/review/{conversation_id}", tags=["chat"])
async def review_sql(
    conversation_id: str,
    body: ReviewRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_appdb_session),
):
    """
    Resume a graph that was paused at the human_review HITL checkpoint.

    - Validates that the conversation belongs to the calling user.
    - Idempotency: if the graph has already been resumed (hitl_approved set),
      returns HTTP 409 to prevent double-execution.
    - Resumes with Command(resume={"approved": ..., "feedback": ...}).
    - Returns an SSE stream of remaining events (same format as /chat).
    """
    # ── Ownership check ───────────────────────────────────────────────────────
    try:
        convo = await get_conversation(session, UUID(conversation_id), current_user.id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid conversation ID format")

    if convo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied",
        )

    graph = app.state.graph

    # ── Idempotency: check if already resumed ─────────────────────────────────
    if hasattr(app.state, "checkpointer") and app.state.checkpointer is not None:
        config = {"configurable": {"thread_id": conversation_id}}
        try:
            checkpoint_tuple = await app.state.checkpointer.aget_tuple(config)
            if checkpoint_tuple:
                saved_state = checkpoint_tuple.checkpoint.get("channel_values", {})
                if saved_state.get("hitl_approved") is not None:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="This query has already been reviewed. Submit a new question to start again.",
                    )
        except HTTPException:
            raise
        except Exception:
            pass  # Checkpoint fetch failure is non-fatal — proceed with resume

    return EventSourceResponse(
        _review_generator(graph, conversation_id, body.approved, body.feedback)
    )


async def _review_generator(graph, conversation_id: str, approved: bool, feedback: Optional[str]):
    """SSE generator for the HITL resume stream."""
    from langgraph.types import Command

    config = {"configurable": {"thread_id": conversation_id}}
    resume_payload = {"approved": approved, "feedback": feedback or ""}
    final_state: dict = {}

    try:
        async for event_type, event_data, fs in _stream_graph_events(
            graph, Command(resume=resume_payload), config
        ):
            if event_type == "approval_required":
                # Rejection caused another HITL pause (re-generated SQL needs re-review)
                yield {"event": "message", "data": json.dumps(event_data)}
                return
            if event_type == "final":
                final_state = fs
                break
            yield {"event": "message", "data": json.dumps(event_data, default=str)}

        async for evt in _emit_answer_and_done(final_state, conversation_id):
            yield evt

    except Exception as e:
        yield {
            "event": "message",
            "data": json.dumps({"type": "error", "content": f"Resume error: {e}"}),
        }


async def _emit_answer_and_done(final_state: dict, conversation_id: str):
    """Stream the final answer token-by-token, persist to DB, emit done."""
    answer = final_state.get("final_answer") or "I could not generate an answer."

    # Token streaming
    words = answer.split(" ")
    for i, word in enumerate(words):
        chunk = word if i == len(words) - 1 else word + " "
        yield {
            "event": "message",
            "data": json.dumps({"type": "token", "content": chunk}),
        }
        await asyncio.sleep(0.008)

    # Persist assistant message
    from .db import get_appdb_engine
    from sqlalchemy.ext.asyncio import AsyncSession as _AsyncSession
    async with _AsyncSession(get_appdb_engine()) as new_session:
        await add_message(
            new_session,
            UUID(conversation_id),
            "assistant",
            answer,
            generated_sql=final_state.get("generated_sql"),
            chart_base64=final_state.get("chart_base64"),
            retry_count=final_state.get("retry_count", 0),
            node_path=final_state.get("node_path", []),
        )
        await new_session.commit()

    # Done event
    yield {
        "event": "message",
        "data": json.dumps({
            "type": "done",
            "conversation_id": conversation_id,
            "retry_count": final_state.get("retry_count", 0),
            "node_path": final_state.get("node_path", []),
            "selected_tables": final_state.get("selected_tables", []),
            "chart_base64": final_state.get("chart_base64"),
            "sql_columns": final_state.get("sql_columns"),
            "total_rows": len(final_state.get("sql_results") or []),
            "hitl_approved": final_state.get("hitl_approved"),
        }),
    }
