"""
nodes/execute_sql.py
Execute the validated SQL against the Chinook read-only database.

Safety layers (defence in depth):
  1. chinook_ro role — SELECT only, cannot write even if this node is bypassed
  2. statement_timeout=5s set on the role itself (not just the connection)
  3. row_cap enforced here in Python (fetchmany) as a second row-level guard
  4. Returns sql_columns alongside sql_results so the frontend can
     render a proper DataTable with ordered column headers.
"""
import asyncio

from . import AgentState
from ..db import execute_chinook_query
from ..config import get_settings


async def execute_sql_node(state: AgentState) -> AgentState:
    """Execute the validated SQL and store results (or execution error) in state."""
    node_path = list(state.get("node_path", []))
    node_path.append("execute_sql")

    sql = state.get("generated_sql", "")
    settings = get_settings()

    try:
        rows = await asyncio.wait_for(
            execute_chinook_query(sql, row_cap=settings.sql_row_cap),
            timeout=6.0,  # Slightly above DB statement_timeout as Python-level backstop
        )
        # Extract ordered column names from first row
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
