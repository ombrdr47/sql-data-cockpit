"""Compatibility node for workflows created before Python execution was disabled."""
from . import AgentState

async def python_tool_node(state: AgentState) -> AgentState:
    return {**state, "python_output": "Python analysis is unavailable. Use SQL results for this answer.",
            "chart_base64": None, "node_path": [*state.get("node_path", []), "python_tool"]}
