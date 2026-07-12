"""
nodes/schema_context.py
Static node — loads the Chinook schema once and injects it into state.

Why not vector retrieval?
  The full Chinook schema is ~11 tables × ~5 columns avg = ~55 columns.
  At ~4 chars/token, this is ~500-700 tokens — comfortably fits in context.
  Vector retrieval adds latency, a vector store dependency, and risk of
  incomplete schema recall. For this scale, static injection is strictly
  better. (Worth explaining in the interview: the decision is scale-dependent.)
"""
from . import AgentState
from ..db import get_schema_text


async def schema_context_node(state: AgentState) -> AgentState:
    """Load schema text and inject into state."""
    schema = await get_schema_text()
    node_path = list(state.get("node_path", []))
    node_path.append("schema_context")
    return {
        **state,
        "schema_text": schema,
        "node_path": node_path,
    }
