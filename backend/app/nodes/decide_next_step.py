"""Route SQL results directly to synthesis; generated Python is disabled."""
from . import AgentState

async def decide_next_step_node(state: AgentState) -> AgentState:
    return {**state, "needs_python_tool": False,
            "node_path": [*state.get("node_path", []), "decide_next_step"]}
