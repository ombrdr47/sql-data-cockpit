"""
nodes/table_selector.py
Dynamic schema pruning node — replaces static schema_context.

Instead of dumping the full Chinook DDL into every prompt, this node:
  1. Analyses the user question via keyword matching + FK graph expansion
  2. Selects only the 2-5 most relevant tables
  3. Fetches a pruned schema string (DDL + 3 sample rows per table)
  4. Records which tables were selected in state (used by generate_sql
     for targeted SQL generation and by streaming for the reasoning log)

This demonstrates the production pattern for scaling to databases with
100+ tables — a key differentiator vs. naive LLM wrappers.
"""
from . import AgentState
from ..schema_catalog import get_pruned_schema_text


async def table_selector_node(state: AgentState) -> AgentState:
    """
    Prune the schema to only the tables relevant to the user's question.
    Populates state['schema_text'] and state['selected_tables'].
    """
    node_path = list(state.get("node_path", []))
    node_path.append("table_selector")

    question = state.get("question", "")

    pruned_schema, selected_tables = await get_pruned_schema_text(question)

    return {
        **state,
        "schema_text": pruned_schema,
        "selected_tables": selected_tables,
        "node_path": node_path,
    }
