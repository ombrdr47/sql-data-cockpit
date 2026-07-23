"""
nodes/execute_sql.py
Execute the validated SQL against the correct database.

Routing:
  connection_id=None  → Chinook read-only role (existing behaviour)
  connection_id set   → BYODB user engine (read-only via server_settings)

Safety layers (defence in depth):
  1. chinook_ro role / default_transaction_read_only=on — cannot write even if bypassed
  2. statement_timeout=5s set on Chinook role; 6s Python backstop on both paths
  3. row_cap enforced here in Python (fetchmany) as a second row-level guard
  4. Returns sql_columns alongside sql_results so the frontend can
     render a proper DataTable with ordered column headers.
"""
import asyncio
import uuid

from . import AgentState
from ..db import execute_chinook_query
from ..config import get_settings


async def _execute_byodb(sql: str, connection_id: str, row_cap: int) -> tuple[list, list]:
    """Execute SQL against a user's own database via the engine pool."""
    from ..engine_pool import engine_pool
    from sqlalchemy import text

    engine = await engine_pool.get_engine(uuid.UUID(connection_id))
    async with engine.connect() as conn:
        result = await conn.execute(text(sql))
        keys = list(result.keys())
        rows = result.fetchmany(row_cap)
        data = [dict(zip(keys, row)) for row in rows]
        return data, keys


async def execute_sql_node(state: AgentState) -> AgentState:
    """Execute the validated SQL and store results (or execution error) in state."""
    node_path = list(state.get("node_path", []))
    node_path.append("execute_sql")

    sql = state.get("generated_sql", "")
    settings = get_settings()
    connection_id = state.get("connection_id")

    try:
        if connection_id:
            # ── BYODB path ────────────────────────────────────────────────────
            rows, keys = await asyncio.wait_for(
                _execute_byodb(sql, connection_id, settings.sql_row_cap),
                timeout=6.0,
            )
            sql_columns = keys if rows else []
        else:
            # ── Chinook path (unchanged) ──────────────────────────────────────
            rows = await asyncio.wait_for(
                execute_chinook_query(sql, row_cap=settings.sql_row_cap),
                timeout=6.0,
            )
            sql_columns = list(rows[0].keys()) if rows else []

        return {
            **state,
            "sql_results": rows,
            "sql_columns": sql_columns,
            "execution_error": None,
            "node_path": node_path,
        }

    except asyncio.TimeoutError:
        return {
            **state,
            "sql_results": None,
            "sql_columns": None,
            "execution_error": (
                "Query timed out after 6 seconds. "
                "Try to simplify the query or reduce the result set."
            ),
            "node_path": node_path,
        }
    except Exception as e:
        error_msg = str(e)
        if "asyncpg" in error_msg:
            parts = error_msg.split("\n")
            error_msg = next((p for p in parts if "ERROR" in p or "error" in p), error_msg)

        return {
            **state,
            "sql_results": None,
            "sql_columns": None,
            "execution_error": f"Database execution error: {error_msg}",
            "node_path": node_path,
        }
