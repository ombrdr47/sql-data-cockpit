"""
app/nodes/__init__.py
LangGraph state type shared across all nodes.
"""
from __future__ import annotations
from typing import Any, Optional, TypedDict


class AgentState(TypedDict, total=False):
    """
    Shared state passed between all LangGraph nodes.
    Every field is optional (total=False) so nodes can update partial state.
    """
    # ── Input ─────────────────────────────────────────────────────────────────
    question: str                    # The user's natural-language question
    conversation_id: str             # UUID of the active conversation
    user_id: str                     # UUID of the authenticated user

    # ── Datasource ────────────────────────────────────────────────────────────
    # None = Chinook demo; UUID str = user's saved connection
    connection_id: Optional[str]     # UserConnection.id, or None for Chinook
    datasource_name: Optional[str]   # Human-readable name shown in prompts/UI

    # ── Schema context (upgraded: pruned per-question) ────────────────────────
    schema_text: str                 # Pruned Chinook schema DDL + sample rows
    selected_tables: list[str]       # Tables selected by table_selector node

    # ── SQL generation / validation / execution ───────────────────────────────
    generated_sql: Optional[str]     # Raw SQL from the LLM
    sql_valid: bool                  # Did validation pass?
    validation_error: Optional[str]  # Error message if validation failed (w/ fuzzy hints)
    sql_results: Optional[list]      # Rows from Chinook (list of dicts)
    sql_columns: Optional[list[str]] # Column names from the query (for DataTable header)
    execution_error: Optional[str]   # Error message if execution failed
    retry_count: int                 # How many times we've retried (0-based)

    # ── Routing ───────────────────────────────────────────────────────────────
    needs_python_tool: bool          # Did the router decide we need pandas?

    # ── Human-in-the-Loop review ─────────────────────────────────────────────
    hitl_approved: Optional[bool]    # True=approved, False=rejected, None=not yet reviewed
    hitl_feedback: Optional[str]     # User's rejection reason (fed back into generate_sql)

    # ── Python tool ──────────────────────────────────────────────────────────
    python_output: Optional[str]     # Text output from python_tool (sandbox)
    chart_base64: Optional[str]      # Plotly JSON string (field name kept for compat)

    # ── Final answer ─────────────────────────────────────────────────────────
    final_answer: Optional[str]      # The synthesized natural-language answer

    # ── Telemetry / observability ─────────────────────────────────────────────
    node_path: list                  # List of nodes visited in this run
    node_latencies: dict[str, float] # Per-node wall-clock times (node → seconds)
    token_usage: dict[str, Any]      # LLM token counts (prompt, completion, total)
