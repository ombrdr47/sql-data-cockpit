"""
nodes/generate_sql.py
LLM node — generates SQL from the user question + schema (+ prior error on retry).

On retry, the prior error is appended to context so the model can self-correct.
The retry count is already incremented by the graph before calling this node again.
"""
from langchain_core.messages import HumanMessage, SystemMessage

from . import AgentState
from ..llm import get_llm

SYSTEM_PROMPT_TEMPLATE = """You are an expert PostgreSQL query writer for the {database_name} database.

Rules you MUST follow:
1. Generate ONLY a single SELECT statement — no INSERT, UPDATE, DELETE, DROP, CREATE, etc.
2. Use only tables and columns that exist in the schema provided.
3. If the question asks about something that doesn't exist in the schema, respond with:
   CANNOT_ANSWER: <brief reason>
4. Do not use aliases that shadow table names in ways that confuse column resolution.
5. Always qualify column names with table aliases when joining.
6. Output ONLY the raw SQL — no markdown, no explanation, no code fences.
7. If the user asks for the "best", "top", or requires analysis/charting, DO NOT use LIMIT 1. Return the top 50 or the full relevant dataset so the downstream Python analyst can perform a proper comparison.
"""

USER_PROMPT_TEMPLATE = """Database schema:
{schema}

User question: {question}

{error_context}

SQL query:"""


async def generate_sql_node(state: AgentState) -> AgentState:
    """Call the LLM to generate SQL from the question + schema."""
    llm = get_llm()

    # Resolve datasource name for the system prompt
    database_name = state.get("datasource_name") or "Chinook music store"
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(database_name=database_name)

    # Build error context string if this is a retry
    error_context = ""
    if state.get("validation_error"):
        error_context = (
            f"PREVIOUS ATTEMPT FAILED VALIDATION:\n{state['validation_error']}\n"
            f"Fix the SQL and try again."
        )
    elif state.get("execution_error"):
        error_context = (
            f"PREVIOUS ATTEMPT FAILED EXECUTION:\n{state['execution_error']}\n"
            f"Fix the SQL and try again."
        )

    user_msg = USER_PROMPT_TEMPLATE.format(
        schema=state.get("schema_text", ""),
        question=state.get("question", ""),
        error_context=error_context,
    )

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_msg),
    ]

    response = await llm.ainvoke(messages)
    generated_sql = response.content.strip()

    node_path = list(state.get("node_path", []))
    node_path.append("generate_sql")

    return {
        **state,
        "generated_sql": generated_sql,
        # Reset error state for this new attempt
        "validation_error": None,
        "execution_error": None,
        "sql_valid": False,
        "node_path": node_path,
    }
