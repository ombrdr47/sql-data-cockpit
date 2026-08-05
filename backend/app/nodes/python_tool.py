"""
nodes/python_tool.py
Sandboxed Python execution node for data analysis and chart generation.

Security upgrade: now uses app.sandbox.run_code_in_sandbox() which executes
LLM-generated code in a fully ISOLATED SUBPROCESS with:
  - OS-level memory cap (512 MB RLIMIT_AS)
  - OS-level CPU cap (8 seconds RLIMIT_CPU)
  - No file descriptor inheritance (spawn context)
  - Allowlist-only imports (pandas, numpy, plotly, json, math, statistics)

The LLM generates Python that operates on a `data` variable (list of dicts,
the SQL results) and must assign output to `result` (str/num) and/or `fig`
(a Plotly figure).
"""
import asyncio
import json
from langchain_core.messages import HumanMessage, SystemMessage

from . import AgentState
from ..llm import get_llm
from ..sandbox import run_code_in_sandbox, SandboxTimeoutError, SandboxSecurityError

CODEGEN_SYSTEM = """You are a Python data analyst. You receive:
1. A user question
2. A `data` variable (list of dicts) containing SQL query results

Write Python code that:
- Analyses `data` using pandas (available as `pd`) and plotly (`px` or `go`).
- **For charts: Make them interactive using Plotly.**
  - Assign your Plotly figure to a variable named `fig` (e.g., `fig = px.bar(...)`).
  - Ensure the chart has a descriptive title and appropriate axis labels.
  - Use a visually appealing color scheme. Do NOT call `fig.show()`.
- Store any computed text/number results in a variable called `result` (string).
- Use ONLY pandas, standard Python, and plotly.
- Keep the code concise (< 30 lines). Avoid loading external files.

Output ONLY the Python code, no markdown fences, no explanation."""

CODEGEN_PROMPT = """User question: {question}

Data sample (first 10 rows of {total_rows} total):
{data_preview}

Python code:"""


async def python_tool_node(state: AgentState) -> AgentState:
    """Generate Python analytics code and execute it in the isolated sandbox."""
    node_path = list(state.get("node_path", []))
    node_path.append("python_tool")

    data = state.get("sql_results") or []
    question = state.get("question", "")

    # ── Step 1: LLM generates the analysis code ───────────────────────────────
    llm = get_llm(state["groq_api_key"])
    data_preview = json.dumps(data[:10], indent=2, default=str)

    messages = [
        SystemMessage(content=CODEGEN_SYSTEM),
        HumanMessage(
            content=CODEGEN_PROMPT.format(
                question=question,
                total_rows=len(data),
                data_preview=data_preview,
            )
        ),
    ]
    response = await llm.ainvoke(messages)
    code = response.content.strip()

    # Strip markdown code fences if the model included them
    if code.startswith("```"):
        lines = code.split("\n")
        code = "\n".join(line for line in lines if not line.startswith("```"))

    # ── Step 2: Execute in isolated subprocess sandbox ────────────────────────
    python_output = None
    chart_base64 = None  # field name kept for backward compat; contains Plotly JSON

    try:
        # run_in_executor so we don't block the async event loop
        # (Process.join() is blocking; we call it inside a thread)
        loop = asyncio.get_event_loop()
        sandbox_result = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                run_code_in_sandbox,
                code,
                data,
            ),
            timeout=15.0,  # outer async timeout (sandbox has its own inner timeout)
        )

        python_output = sandbox_result.get("python_output")
        chart_base64 = sandbox_result.get("chart_json")  # Plotly JSON string

        if sandbox_result.get("error"):
            python_output = f"Analysis error: {sandbox_result['error']}"
            print(f"[python_tool] Sandbox error: {sandbox_result['error']}", flush=True)

    except SandboxTimeoutError as e:
        python_output = str(e)
        print(f"[python_tool] Timeout: {e}", flush=True)

    except SandboxSecurityError as e:
        python_output = str(e)
        print(f"[python_tool] Security violation: {e}", flush=True)

    except asyncio.TimeoutError:
        python_output = "Python analysis timed out. The dataset may be too large."
        print("[python_tool] Outer async timeout", flush=True)

    except Exception as e:
        python_output = f"Unexpected sandbox error: {str(e)}"
        print(f"[python_tool] Unexpected error: {e}", flush=True)

    return {
        **state,
        "python_output": python_output,
        "chart_base64": chart_base64,
        "node_path": node_path,
    }
