"""ReAct 策略：模型 ↔ 工具节点循环，带最大迭代与工具守卫。

参考 AgentForge「ReAct」：模型输出二选一——
  {"action": "tool_call", "tool": "<白名单内工具>", "args": {...}}  → 工具节点
  {"action": "final", "answer": "..."}                              → 结束
"""

import json

from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

from app.agents.strategies.base import AgentStrategy
from app.harness.hooks import RunContext
from app.harness.tool_guard import ToolGuard
from app.services.llm import chat_text

MAX_ITERATIONS = 6

_PROTOCOL_PROMPT = """
## 工具调用协议
你只能通过以下 JSON 协议与工具交互，不得输出协议以外的内容：
- 需要调用工具时输出: {{"action": "tool_call", "tool": "<工具名>", "args": {{...}}}}
- 已经获得足够信息、可以回答时输出: {{"action": "final", "answer": "最终回答"}}
一次只能输出一个 JSON 对象。最多允许 {max_iter} 次工具调用。
""".strip()


class _State(TypedDict):
    messages: list[dict]
    iteration: int
    output: str


class ReActStrategy(AgentStrategy):
    """参考 AgentForge「ReAct」：带输入过滤与工具守卫的思考-行动循环。"""

    def run(
        self,
        *,
        system_prompt: str,
        user_input: str,
        context: dict,
        ctx: RunContext,
        guard: ToolGuard,
    ) -> dict:
        history: list[dict] = [{"role": "user", "content": user_input}]
        final_answer = ""

        def model_node(state: _State) -> dict:
            nonlocal final_answer
            ctx.trace.add_event("node_start", {"node": "model"})
            try:
                prompt = system_prompt + "\n\n" + _PROTOCOL_PROMPT.format(max_iter=MAX_ITERATIONS)
                response = chat_text(prompt, json.dumps(state["messages"], ensure_ascii=False), ctx=ctx)
                # 旁路提取 final 答案：模型直接输出 final 时不会经过 tool_node
                try:
                    parsed = json.loads(response)
                    if isinstance(parsed, dict) and parsed.get("action") == "final":
                        final_answer = str(parsed.get("answer", ""))
                except json.JSONDecodeError:
                    pass
                return {"output": response, "iteration": state["iteration"] + 1}
            finally:
                ctx.trace.add_event("node_end", {"node": "model"})

        def tool_node(state: _State) -> dict:
            """解析模型输出并调用白名单工具（ToolGuard 拦截未授权调用）。"""
            nonlocal final_answer
            ctx.trace.add_event("node_start", {"node": "tools"})
            try:
                try:
                    parsed = json.loads(state["output"])
                except json.JSONDecodeError:
                    parsed = {"action": "final", "answer": state["output"]}

                if parsed.get("action") == "final":
                    final_answer = parsed.get("answer", "")
                    ctx.trace.add_event("final_answer", {"answer": final_answer[:500]})
                    return {"messages": state["messages"], "output": parsed.get("answer", "")}

                tool_name = parsed.get("tool", "")
                args = parsed.get("args", {}) or {}
                try:
                    result = guard.invoke(tool_name, **args)
                    ctx.add_tool_call(tool_name, args, result, ok=True)
                    obs = {"role": "tool", "name": tool_name, "content": str(result)[:2000]}
                except Exception as exc:
                    ctx.add_tool_call(tool_name, args, str(exc), ok=False)
                    obs = {"role": "tool", "name": tool_name, "content": f"工具调用失败: {exc}"}
                return {"messages": state["messages"] + [{"role": "assistant", "content": state["output"]}, obs]}
            finally:
                ctx.trace.add_event("node_end", {"node": "tools"})

        def should_continue(state: _State) -> str:
            try:
                parsed = json.loads(state["output"])
                is_final = parsed.get("action") == "final"
            except json.JSONDecodeError:
                is_final = True
            if is_final or state["iteration"] >= MAX_ITERATIONS:
                return "end"
            return "continue"

        graph = StateGraph(_State)
        graph.add_node("model", model_node)
        graph.add_node("tools", tool_node)
        graph.add_edge(START, "model")
        graph.add_conditional_edges("model", should_continue, {"continue": "tools", "end": END})
        graph.add_edge("tools", "model")
        app = graph.compile()

        app.invoke({"messages": history, "iteration": 0, "output": ""})
        ctx.trace.final_output = final_answer
        return {"output": final_answer}
