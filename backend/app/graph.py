"""
app/graph.py
LangGraph StateGraph wiring.

Node flow (with HITL):
  table_selector
    → generate_sql
      → validate_sql ──(invalid, retries left)──→ increment_retry → generate_sql
        ──(invalid, no retries)────────────────→ synthesize_answer
        ──(valid)──────────────────────────────→ human_review  ← NEW HITL CHECKPOINT
          ──(approved)───────────────────────→ execute_sql
          ──(rejected, retries left)─────────→ increment_retry → generate_sql
          ──(rejected, no retries)───────────→ synthesize_answer
            ──(error, retries left)──────────→ increment_retry → generate_sql
            ──(error, no retries)────────────→ synthesize_answer
            ──(success)──────────────────────→ decide_next_step
              ──(ANSWER_DIRECTLY)────────────→ synthesize_answer
              ──(NEEDS_PYTHON_TOOL)──────────→ python_tool → synthesize_answer
  synthesize_answer → END
"""
from typing import Optional
from langgraph.graph import StateGraph, START, END

from .nodes import AgentState
from .nodes.table_selector import table_selector_node
from .nodes.generate_sql import generate_sql_node
from .nodes.validate_sql import validate_sql_node
from .nodes.human_review import human_review_node          # HITL checkpoint
from .nodes.execute_sql import execute_sql_node
from .nodes.decide_next_step import decide_next_step_node
from .nodes.python_tool import python_tool_node
from .nodes.synthesize_answer import synthesize_answer_node
from .graph_routing import (
    route_after_validate,
    route_after_execute,
    route_after_decide,
    route_after_review,                                     # HITL routing
)


# ── Retry wrapper ──────────────────────────────────────────────────────────────

async def increment_retry(state: AgentState) -> AgentState:
    """Increment the retry counter before calling generate_sql again."""
    return {
        **state,
        "retry_count": state.get("retry_count", 0) + 1,
        # Clear HITL state so a fresh review is required after regeneration
        "hitl_approved": None,
        "hitl_feedback": None,
    }


# ── Graph builder ──────────────────────────────────────────────────────────────

def build_graph(checkpointer=None) -> StateGraph:
    """
    Construct and compile the LangGraph StateGraph.

    checkpointer: pass an AsyncPostgresSaver (from connection pool) for
    production — required for HITL interrupt/resume to work across requests.
    Pass None for stateless unit tests only (HITL will not be resumable).
    """
    builder = StateGraph(AgentState)

    # ── Register nodes ────────────────────────────────────────────────────────
    builder.add_node("table_selector",    table_selector_node)
    builder.add_node("generate_sql",      generate_sql_node)
    builder.add_node("validate_sql",      validate_sql_node)
    builder.add_node("human_review",      human_review_node)   # HITL
    builder.add_node("execute_sql",       execute_sql_node)
    builder.add_node("decide_next_step",  decide_next_step_node)
    builder.add_node("python_tool",       python_tool_node)
    builder.add_node("synthesize_answer", synthesize_answer_node)
    builder.add_node("increment_retry",   increment_retry)

    # ── Entry point ───────────────────────────────────────────────────────────
    builder.add_edge(START, "table_selector")
    builder.add_edge("table_selector", "generate_sql")
    builder.add_edge("generate_sql", "validate_sql")

    # ── After validation: execute, retry, or fail ─────────────────────────────
    builder.add_conditional_edges(
        "validate_sql",
        route_after_validate,
        {
            "execute_sql":      "human_review",   # valid SQL → HITL review first
            "retry_generate":   "increment_retry",
            "synthesize_answer":"synthesize_answer",
        },
    )

    # ── Retry loop ────────────────────────────────────────────────────────────
    builder.add_edge("increment_retry", "generate_sql")

    # ── After HITL review: execute (approved) or retry (rejected) ─────────────
    builder.add_conditional_edges(
        "human_review",
        route_after_review,
        {
            "execute_sql":      "execute_sql",
            "retry_generate":   "increment_retry",
            "synthesize_answer":"synthesize_answer",
        },
    )

    # ── After execution: decide, retry, or fail ───────────────────────────────
    builder.add_conditional_edges(
        "execute_sql",
        route_after_execute,
        {
            "decide_next_step": "decide_next_step",
            "retry_generate":   "increment_retry",
            "synthesize_answer":"synthesize_answer",
        },
    )

    # ── After decide: python analysis or direct synthesis ─────────────────────
    builder.add_conditional_edges(
        "decide_next_step",
        route_after_decide,
        {
            "python_tool":      "python_tool",
            "synthesize_answer":"synthesize_answer",
        },
    )

    builder.add_edge("python_tool",       "synthesize_answer")
    builder.add_edge("synthesize_answer", END)

    # interrupt_before is NOT needed — interrupt() inside human_review_node
    # handles the pause natively via LangGraph's GraphInterrupt mechanism.
    return builder.compile(checkpointer=checkpointer)
