"""Simple Chat 策略：最简直通，单次 LLM 调用，不挂工具。"""

from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

from app.agents.strategies.base import AgentStrategy
from app.harness.hooks import RunContext
from app.harness.tool_guard import ToolGuard
from app.services.llm import chat_text


class _State(TypedDict):
    messages: list[dict]
    output: str


class SimpleChatStrategy(AgentStrategy):
    """参考 AgentForge「Simple Chat」：无工具直答。"""

    def run(
        self,
        *,
        system_prompt: str,
        user_input: str,
        context: dict,
        ctx: RunContext,
        guard: ToolGuard,
    ) -> dict:
        def node(state: _State) -> dict:
            ctx.trace.add_event("node_start", {"node": "chat"})
            try:
                output = chat_text(system_prompt, state["messages"][-1]["content"], ctx=ctx)
                return {"output": output}
            finally:
                ctx.trace.add_event("node_end", {"node": "chat"})

        graph = StateGraph(_State)
        graph.add_node("chat", node)
        graph.add_edge(START, "chat")
        graph.add_edge("chat", END)
        app = graph.compile()

        result = app.invoke({"messages": [{"role": "user", "content": user_input}], "output": ""})
        ctx.trace.final_output = result.get("output", "")
        return {"output": result.get("output", "")}
