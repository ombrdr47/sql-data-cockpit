"""
nodes/decide_next_step.py
LLM router — decides whether the SQL results are sufficient to answer the question
OR if the python_tool is needed for computation the SQL can't express
(e.g., correlation, visualisation, statistical aggregation over the already-fetched data).

Note: the python_tool ONLY receives the rows already fetched from the DB.
It does NOT get DB credentials or network access. This is a data-processing
sandbox, not a second query path.
"""
import json
from langchain_core.messages import HumanMessage, SystemMessage

from . import AgentState
from ..llm import get_llm

SYSTEM_PROMPT = """You are a decision-making component in a data pipeline.
Given a user question and SQL query results, decide whether:
  A) The SQL results are sufficient to answer the question directly
  B) A Python computation is needed (e.g., correlation, regression, chart generation,
     percentile calculation, or anything SQL cannot easily express)

NOTE: If the user asks for the "best", "worst", or requires comparative multi-factor analysis or charting, always choose NEEDS_PYTHON_TOOL so the data can be analyzed.

Respond with EXACTLY one of:
  ANSWER_DIRECTLY
  NEEDS_PYTHON_TOOL

No explanation. Just one of those two strings."""

ROUTER_PROMPT = """User question: {question}

SQL results (first 5 rows shown):
{results_preview}

Decision:"""


async def decide_next_step_node(state: AgentState) -> AgentState:
    """Route: should we go to python_tool or straight to synthesize_answer?"""
    node_path = list(state.get("node_path", []))
    node_path.append("decide_next_step")

    results = state.get("sql_results") or []
    question = state.get("question", "")

    # Preview first 5 rows for the router
    preview_rows = results[:5]
    results_preview = json.dumps(preview_rows, indent=2, default=str)

    llm = get_llm()
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(
            content=ROUTER_PROMPT.format(
                question=question,
                results_preview=results_preview,
            )
        ),
    ]

    response = await llm.ainvoke(messages)
    decision = response.content.strip().upper()

    needs_python = "NEEDS_PYTHON_TOOL" in decision

    return {
        **state,
        "needs_python_tool": needs_python,
        "node_path": node_path,
    }
