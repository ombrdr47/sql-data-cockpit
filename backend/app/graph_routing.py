"""
app/graph_routing.py
Pure routing functions, separated from graph.py to allow import without langgraph.
This makes unit tests possible without the full langgraph dependency installed.
"""
from __future__ import annotations
from typing import Any


def route_after_validate(state: dict) -> str:
    """After validate_sql: retry, fail-synthesize, or continue."""
    from .config import get_settings
    settings = get_settings()
    if state.get("sql_valid"):
        return "execute_sql"
    # Check for CANNOT_ANSWER — no point retrying, go straight to synthesis
    err = state.get("validation_error", "")
    if err and err.upper().startswith("CANNOT_ANSWER"):
        return "synthesize_answer"
    # Retry if budget allows
    if state.get("retry_count", 0) < settings.max_retries:
        return "retry_generate"
    return "synthesize_answer"


def route_after_execute(state: dict) -> str:
    """After execute_sql: retry on error, continue on success."""
    from .config import get_settings
    settings = get_settings()
    if state.get("execution_error"):
        if state.get("retry_count", 0) < settings.max_retries:
            return "retry_generate"
        return "synthesize_answer"
    return "decide_next_step"


def route_after_decide(state: dict) -> str:
    """After decide_next_step: python_tool or direct synthesis."""
    if state.get("needs_python_tool"):
        return "python_tool"
    return "synthesize_answer"


def route_after_review(state: dict) -> str:
    """
    After human_review: proceed to execute_sql (approved) or retry
    generate_sql (rejected — user's feedback becomes the new error context).
    """
    if state.get("hitl_approved"):
        return "execute_sql"
    # Rejected: fall back into the retry loop (same path as validation failure)
    from .config import get_settings
    settings = get_settings()
    if state.get("retry_count", 0) < settings.max_retries:
        return "retry_generate"
    # Retry budget exhausted after repeated rejections
    return "synthesize_answer"
