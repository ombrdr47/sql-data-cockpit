"""
nodes/table_selector.py
Dynamic schema pruning node — routes to Chinook or BYODB catalog.

Chinook path (connection_id=None):
  Uses the existing keyword-based static catalog for speed.

BYODB path (connection_id set):
  Uses DynamicSchemaCatalog to introspect the user's database at runtime.
  For ≤20 tables: includes full schema.
  For >20 tables: asks the LLM to pick the relevant subset.
"""
import uuid

from . import AgentState
from ..llm import resolve_api_key
from ..schema_catalog import get_pruned_schema_text, dynamic_catalog


async def table_selector_node(state: AgentState) -> AgentState:
    """Prune the schema to only the tables relevant to the user's question."""
    node_path = list(state.get("node_path", []))
    node_path.append("table_selector")
    if state.get("saved_sql"):
        # Validation introspects the source independently; no model selection is needed.
        return {**state, "schema_text": "", "selected_tables": [], "node_path": node_path}

    question = state.get("question", "")
    if state.get("conversation_context"):
        question = f"Earlier conversation:\n{state['conversation_context']}\n\nCurrent question: {question}"
    connection_id = state.get("connection_id")

    if connection_id:
        # ── BYODB path ────────────────────────────────────────────────────────
        from ..engine_pool import engine_pool

        from ..connection_references import reference_context
        from ..db import get_appdb_session_factory
        async with get_appdb_session_factory()() as session:
            references = await reference_context(session, uuid.UUID(connection_id), uuid.UUID(state['user_id']))
        engine = await engine_pool.get_engine(uuid.UUID(connection_id))
        pruned_schema, selected_tables = await dynamic_catalog.get_pruned_schema_text(
            engine, question + references, api_key=await resolve_api_key(state["user_id"])
        )
        pruned_schema += references
    else:
        # ── Chinook fast-path ─────────────────────────────────────────────────
        pruned_schema, selected_tables = await get_pruned_schema_text(question)

    return {
        **state,
        "schema_text": pruned_schema,
        "selected_tables": selected_tables,
        "node_path": node_path,
    }
