"""Workbench 策略：多 Agent 编排器——规划、分发子 Agent（串行/并行）、扇入聚合。

参考 AgentForge「Workbench/像素工作室」：编排 Agent 负责任务拆解与调度，
子 Agent 在独立命名空间执行（各持工具白名单与记忆），结果扇入聚合。
"""

import json
import logging

from pydantic import BaseModel, Field

from app.agents.strategies.base import AgentStrategy
from app.harness.hooks import RunContext
from app.harness.tool_guard import ToolGuard
from app.services.llm import chat_json, chat_text

logger = logging.getLogger("careerkit.workbench")


class _SubTask(BaseModel):
    """编排器拆解出的子任务。"""

    agent: str = Field(description="子 Agent 名称（必须是已启用 Agent）")
    task: str = Field(description="子任务描述")
    order: int = Field(default=0, description="执行顺序；同 order 视为可并行")
    context: dict = Field(default_factory=dict, description="子任务附加上下文")


class _Plan(BaseModel):
    summary: str = Field(description="任务拆解说明")
    subtasks: list[_SubTask] = Field(description="子任务清单")


class WorkbenchStrategy(AgentStrategy):
    """编排 Agent：拆解 → 分发（串行/并行）→ 聚合。"""

    def run(
        self,
        *,
        system_prompt: str,
        user_input: str,
        context: dict,
        ctx: RunContext,
        guard: ToolGuard,
    ) -> dict:
        # 延迟导入避免循环依赖（runner 依赖策略注册）
        from app.agents.runtime import run_agent_task

        # 1. 规划：拆解子任务
        plan = chat_json(
            system_prompt,
            f"请把以下任务拆解为可并行/串行执行的子任务（每个子任务指定一个子 Agent）：\n{user_input}\n\n附加上下文: {json.dumps(context, ensure_ascii=False)[:1500]}",
            _Plan,
            ctx=ctx,
        )
        ctx.trace.add_event("workbench_plan", {"subtasks": [s.agent for s in plan.subtasks]})
        logger.info("Workbench 计划: %s", [f"{s.agent}:{s.task[:30]}" for s in plan.subtasks])

        # 2. 分发执行：按 order 分组，组内并行、组间串行
        results: dict[int, list[dict]] = {}
        groups: dict[int, list[_SubTask]] = {}
        for sub in plan.subtasks:
            groups.setdefault(sub.order, []).append(sub)

        for order in sorted(groups.keys()):
            subtasks = groups[order]
            outputs = []
            for sub in subtasks:
                try:
                    sub_ctx = RunContext(run_id=f"{ctx.run_id}-{sub.agent}", agent_name=sub.agent, strategy="subtask")
                    out = run_agent_task(
                        sub.agent,
                        sub.task,
                        {**context, **sub.context},
                        with_quality_gate=False,
                        ctx=sub_ctx,
                    )
                    outputs.append({"agent": sub.agent, "task": sub.task, "output": out.get("output", "")})
                except Exception as exc:
                    logger.warning("子 Agent %s 执行失败: %s", sub.agent, exc)
                    outputs.append({"agent": sub.agent, "task": sub.task, "output": f"[执行失败] {exc}"})
            results[order] = outputs

        # 3. 扇入聚合
        flat = [item for order in sorted(results.keys()) for item in results[order]]
        final = chat_text(
            system_prompt,
            f"原始任务: {user_input}\n\n子任务结果:\n{json.dumps(flat, ensure_ascii=False)[:8000]}\n\n请聚合所有结果，输出最终答案。",
            ctx=ctx,
        )
        ctx.trace.final_output = final
        return {"output": final, "subtask_results": flat}
