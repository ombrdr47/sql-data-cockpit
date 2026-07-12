"""
nodes/synthesize_answer.py
Final LLM node — turns the SQL results (+ optional chart/python output)
into a clean natural-language answer.

Handles all terminal states:
  - Normal SQL results → formatted answer
  - CANNOT_ANSWER from validation → polite refusal
  - Retry budget exhausted → graceful failure message
  - Python tool output + chart → narrative with chart reference
"""
import json
from langchain_core.messages import HumanMessage, SystemMessage

from . import AgentState
from ..llm import get_llm

SYSTEM_PROMPT = """You are a friendly, precise data analyst assistant.
Given a user question and query results, write a clear, concise natural-language answer.

Guidelines:
- Lead with the direct answer to the question.
- If results are a list/table, summarize the key findings; include a markdown table
  for structured data with ≤10 rows.
- If there's a chart, mention it briefly (the UI will render it).
- Be honest about limitations (e.g., "results capped at 200 rows").
- If the question couldn't be answered, explain why clearly and suggest alternatives.
- Use markdown formatting (bold, bullets, tables) where it improves readability.
"""

SYNTHESIS_PROMPT = """User question: {question}

Generated SQL:
```sql
{sql}
```

Query results ({row_count} rows):
{results_json}

{python_context}

Please write a helpful answer to the user's question."""

CANNOT_ANSWER_PROMPT = """User question: {question}

This question cannot be answered because:
{reason}

Please explain politely and suggest what kinds of questions the user CAN ask
about the Chinook music store database (artists, albums, tracks, customers, invoices, etc.)."""

RETRY_EXHAUSTED_PROMPT = """User question: {question}

After multiple attempts, the system could not generate a valid, executable SQL query.
Last error: {error}

Please explain the situation clearly and suggest the user rephrase or simplify their question."""


async def synthesize_answer_node(state: AgentState) -> AgentState:
    """Generate the final natural-language answer."""
    node_path = list(state.get("node_path", []))
    node_path.append("synthesize_answer")

    llm = get_llm()
    question = state.get("question", "")

    # ── CANNOT_ANSWER path ────────────────────────────────────────────────────
    validation_error = state.get("validation_error", "")
    if validation_error and validation_error.upper().startswith("CANNOT_ANSWER"):
        reason = validation_error.replace("CANNOT_ANSWER:", "").strip()
        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(
                content=CANNOT_ANSWER_PROMPT.format(
                    question=question, reason=reason
                )
            ),
        ]
        response = await llm.ainvoke(messages)
        return {
            **state,
            "final_answer": response.content.strip(),
            "node_path": node_path,
        }

    # ── Retry exhausted path ──────────────────────────────────────────────────
    if not state.get("sql_results") and (
        state.get("validation_error") or state.get("execution_error")
    ):
        error = state.get("execution_error") or state.get("validation_error") or "Unknown error"
        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(
                content=RETRY_EXHAUSTED_PROMPT.format(
                    question=question, error=error
                )
            ),
        ]
        response = await llm.ainvoke(messages)
        return {
            **state,
            "final_answer": response.content.strip(),
            "node_path": node_path,
        }

    # ── Normal path ───────────────────────────────────────────────────────────
    results = state.get("sql_results") or []
    sql = state.get("generated_sql") or ""
    row_count = len(results)

    # Limit results in prompt (keep first 50 rows for synthesis)
    results_json = json.dumps(results[:50], indent=2, default=str)
    if row_count > 50:
        results_json += f"\n... (showing first 50 of {row_count} rows)"

    # Python tool context
    python_context = ""
    if state.get("python_output"):
        python_context = f"Python analysis result:\n{state['python_output']}"
    if state.get("chart_base64"):
        python_context += "\n[A chart was generated and will be displayed in the UI]"

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(
            content=SYNTHESIS_PROMPT.format(
                question=question,
                sql=sql,
                row_count=row_count,
                results_json=results_json,
                python_context=python_context,
            )
        ),
    ]

    response = await llm.ainvoke(messages)
    return {
        **state,
        "final_answer": response.content.strip(),
        "node_path": node_path,
    }
