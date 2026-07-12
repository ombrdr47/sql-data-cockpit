"""
nodes/human_review.py
Human-in-the-Loop (HITL) review checkpoint.

This node sits between validate_sql and execute_sql. It calls LangGraph's
interrupt() primitive, which:
  1. Suspends graph execution and persists ALL state to the PostgresSaver
     checkpointer (durable, crash-safe, horizontally scalable).
  2. The interrupt payload is streamed to the frontend as an `approval_required`
     SSE event.
  3. Execution resumes ONLY when the caller sends a Command(resume=...) — this
     happens via POST /chat/review/{conversation_id}.

On approval  → sql_valid stays True, graph proceeds to execute_sql.
On rejection → validation_error is set to the user's feedback, which the
               generate_sql node uses as self-correction context on the next
               retry (same path as the existing AST validation retry loop).
"""
from langgraph.types import interrupt

from . import AgentState


async def human_review_node(state: AgentState) -> AgentState:
    """
    Pause the graph and wait for the human to approve or reject the SQL.

    The return value of interrupt() is the resume payload delivered by
    POST /chat/review/{conversation_id} via Command(resume={...}).
    """
    node_path = list(state.get("node_path", [])) + ["human_review"]

    # ── Pause here — LangGraph raises GraphInterrupt internally ───────────────
    # The dict passed to interrupt() is surfaced as the `__interrupt__` value
    # in graph.astream() output, which main.py converts to an SSE event.
    payload: dict = interrupt({
        "sql": state.get("generated_sql", ""),
        "conversation_id": state.get("conversation_id", ""),
        "question": state.get("question", ""),
    })

    # ── Resume payload from POST /chat/review ─────────────────────────────────
    approved: bool = payload.get("approved", False)
    feedback: str | None = payload.get("feedback") or None

    return {
        **state,
        "hitl_approved": approved,
        "hitl_feedback": feedback,
        # On rejection, inject the user's feedback as validation_error so
        # generate_sql picks it up as self-correction context.
        "validation_error": None if approved else (
            feedback or "User rejected the generated SQL — please try a different approach."
        ),
        "node_path": node_path,
    }
