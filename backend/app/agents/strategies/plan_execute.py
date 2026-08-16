"""Plan & Execute 策略：先规划，再迭代执行，最后聚合。

参考 AgentForge「Plan & Execute」：两阶段图——规划器产出步骤清单，
执行器按序执行（每步可调用白名单工具），全部完成后扇出最终答案。
"""

import json

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field
from typing_extensions import TypedDict

from app.agents.strategies.base import AgentStrategy
from app.harness.hooks import RunContext
from app.harness.tool_guard import ToolGuard
from app.services.llm import chat_json, chat_text


class _Plan(BaseModel):
    """规划器输出：执行步骤清单。"""

    steps: list[str] = Field(description="执行步骤，每步一句话，3-6 步")


class _State(TypedDict):
    user_input: str
    plan: list[str]
    step_index: int
    results: list[str]
    output: str


class PlanExecuteStrategy(AgentStrategy):
    """参考 AgentForge「Plan & Execute」：规划→顺序执行→聚合回答。"""

    def run(
        self,
        *,
        system_prompt: str,
        user_input: str,
        context: dict,
        ctx: RunContext,
        guard: ToolGuard,
    ) -> dict:
        def planner(state: _State) -> dict:
            ctx.trace.add_event("node_start", {"node": "planner"})
            try:
                plan = chat_json(
                    system_prompt,
                    f"请为以下任务制定执行计划（不要执行，只需规划步骤）：\n{state['user_input']}",
                    _Plan,
                    ctx=ctx,
                )
                ctx.trace.add_event("plan", {"steps": plan.steps})
                return {"plan": plan.steps}
            finally:
                ctx.trace.add_event("node_end", {"node": "planner"})

        def executor(state: _State) -> dict:
            """逐条执行计划：工具调用走 ToolGuard；纯分析步骤直接记录。"""
            results = list(state["results"])
            idx = state["step_index"]
            if idx >= len(state["plan"]):
                return {"step_index": idx}

            ctx.trace.add_event("node_start", {"node": "executor", "step": idx})
            try:
                step = state["plan"][idx]
                ctx.trace.add_event("step_start", {"step": step})
                # 尝试让模型决定是否需要工具：解析 JSON 工具协议，失败则视为分析步骤
                probe = chat_text(
                    system_prompt + "\n如需工具，仅输出 JSON: {\"tool\": \"...\", \"args\": {...}}，否则输出 OK。",
                    f"执行步骤: {step}\n已知上下文: {json.dumps(context, ensure_ascii=False)[:1500]}",
                    ctx=ctx,
                ).strip()
                try:
                    parsed = json.loads(probe)
                    tool_name = parsed.get("tool", "")
                    if tool_name:
                        result = guard.invoke(tool_name, **(parsed.get("args") or {}))
                        ctx.add_tool_call(tool_name, parsed.get("args") or {}, result, ok=True)
                        results.append(f"[{step}] 工具结果: {str(result)[:800]}")
                    else:
                        results.append(f"[{step}] 分析完成")
                except json.JSONDecodeError:
                    results.append(f"[{step}] 分析完成")
                except Exception as exc:
                    results.append(f"[{step}] 工具失败: {exc}")
                return {"results": results, "step_index": idx + 1}
            finally:
                ctx.trace.add_event("node_end", {"node": "executor", "step": idx})

        def aggregator(state: _State) -> dict:
            ctx.trace.add_event("node_start", {"node": "aggregator"})
            try:
                output = chat_text(
                    system_prompt,
                    f"任务: {state['user_input']}\n\n各步骤执行结果:\n{json.dumps(state['results'], ensure_ascii=False)}\n\n请汇总输出最终答案。",
                    ctx=ctx,
                )
                ctx.trace.final_output = output
                return {"output": output}
            finally:
                ctx.trace.add_event("node_end", {"node": "aggregator"})

        graph = StateGraph(_State)
        graph.add_node("planner", planner)
        graph.add_node("executor", executor)
        graph.add_node("aggregator", aggregator)
        graph.add_edge(START, "planner")
        graph.add_edge("planner", "executor")

        def step_done(state: _State) -> str:
            return "aggregator" if state["step_index"] >= len(state["plan"]) else "executor"

        graph.add_conditional_edges("executor", step_done, {"executor": "executor", "aggregator": "aggregator"})
        graph.add_edge("aggregator", END)
        app = graph.compile()

        result = app.invoke(
            {"user_input": user_input, "plan": [], "step_index": 0, "results": [], "output": ""}
        )
        return {"output": result.get("output", "")}
