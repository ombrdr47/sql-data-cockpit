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
from ..schema_catalog import get_pruned_schema_text, dynamic_catalog


async def table_selector_node(state: AgentState) -> AgentState:
    """Prune the schema to only the tables relevant to the user's question."""
    node_path = list(state.get("node_path", []))
    node_path.append("table_selector")

    question = state.get("question", "")
    connection_id = state.get("connection_id")

    if connection_id:
        # ── BYODB path ────────────────────────────────────────────────────────
        from ..engine_pool import engine_pool

        engine = await engine_pool.get_engine(uuid.UUID(connection_id))
        pruned_schema, selected_tables = await dynamic_catalog.get_pruned_schema_text(
            engine, question
        )
    else:
        # ── Chinook fast-path ─────────────────────────────────────────────────
        pruned_schema, selected_tables = await get_pruned_schema_text(question)

    return {
        **state,
        "schema_text": pruned_schema,
        "selected_tables": selected_tables,
        "node_path": node_path,
    }
