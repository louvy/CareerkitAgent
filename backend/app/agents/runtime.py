"""Agent 运行时（Harness 执行管道）：闭环校验 → 宪法注入 → 策略/处理器执行
→ 宪法校验 → 质量门禁 → Trace/运行落库 → 审计。

所有 Agent 动作必经此管道，保证 可观测性、治理与安全、验证与质量 三支柱落地。
"""

import json
import logging
import uuid
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.core.deps import SessionLocal
from app.core.exceptions import ClosedLoopError, NotFoundError
from app.harness.closed_loop import AgentStatus, ClosedLoop
from app.harness.constitution import constitution_text, has_blocking_violation
from app.harness.hooks import RunContext, run_constitution_check
from app.harness.quality_gate import GateDecision, QualityGate, ReviewVerdict
from app.harness.tool_guard import ToolGuard
from app.models.agent import Agent, AgentRun, AgentTrace
from app.services.audit import audit
from app.services.llm import chat_json
from app.agents.business.reviewer import run_review
from app.agents.strategies import get_strategy
from app.schemas.agent import ReviewVerdictModel

logger = logging.getLogger("careerkit.runtime")

# 业务 Agent 执行器签名：executor(ctx, guard) -> dict
Executor = Callable[[RunContext, ToolGuard], dict]


class AgentRuntime:
    """一次 Agent 运行的 Harness 管道。"""

    def __init__(self, agent: Agent, db: Session):
        self.agent = agent
        self.db = db
        self.gate = QualityGate()

    # ---- 治理：闭环与宪法 ----

    def _assert_executable(self) -> None:
        ClosedLoop.assert_executable(AgentStatus(self.agent.status))

    def _build_system_prompt(self, extra_context: str = "") -> str:
        prompt = constitution_text()
        agent_prompt = (self.agent.config or {}).get("system_prompt", "")
        if agent_prompt:
            prompt += "\n\n" + agent_prompt
        if extra_context:
            prompt += "\n\n## 本次任务上下文\n" + extra_context
        return prompt

    def _build_guard(self) -> ToolGuard:
        allowed = (self.agent.config or {}).get("allowed_tools", [])
        return ToolGuard(self.agent.name, allowed)

    # ---- 验证与质量：宪法校验 + 质量门禁 ----

    def _review(self, output_text: str, task_description: str, source_text: str) -> ReviewVerdict:
        """独立评审 Agent 评估（生成/评估分离）。"""
        sub_ctx = RunContext(
            run_id=uuid.uuid4().hex[:16],
            agent_name="reviewer",
            strategy="simple_chat",
        )
        model = run_review(output_text, task_description, source_text, sub_ctx, ToolGuard("reviewer", []))
        return ReviewVerdict(
            score=model.score,
            dimensions=model.dimensions,
            strengths=model.strengths,
            issues=model.issues,
            suggestions=model.suggestions,
        )

    def _gate_output(
        self, output_text: str, task_description: str, source_text: str, retry_count: int = 0
    ) -> tuple[GateDecision, dict, ReviewVerdict | None]:
        """执行质量门禁：宪法校验 + 评审。返回（决策，门禁记录，评审结论）。"""
        violations = run_constitution_check(output_text, source_text=source_text)
        has_error = has_blocking_violation(violations)
        if has_error:
            return GateDecision.REJECT, {"decision": "reject", "violations": [v.message for v in violations]}, None

        verdict = self._review(output_text, task_description, source_text)
        decision, record = self.gate.run(verdict, retry_count=retry_count)
        return decision, record, verdict

    # ---- 可观测性：落库 ----

    @staticmethod
    def _build_review_feedback(verdict: ReviewVerdict | None) -> str:
        """把 reviewer 结论（issues/suggestions）拼成可注入重生产提示词的反馈段。"""
        if verdict is None:
            return ""
        parts: list[str] = []
        if verdict.issues:
            parts.append("待修复问题：\n- " + "\n- ".join(verdict.issues))
        if verdict.suggestions:
            parts.append("改进建议：\n- " + "\n- ".join(verdict.suggestions))
        if not parts:
            return ""
        return "## 上次评审反馈（必须逐条处理后再输出）\n\n" + "\n\n".join(parts)

    def _persist(
        self, ctx: RunContext, output_text: str, task_description: str, status: str, gate: dict, error: str | None = None, call_type: str = "invoke"
    ) -> AgentRun:
        run = AgentRun(
            agent_id=self.agent.id,
            run_id=ctx.run_id,
            request_id=ctx.request_id,
            call_type=call_type,
            status=status,
            input_summary=task_description[:500],
            output_summary=output_text[:500],
            stats=ctx.to_summary(),
            gate=gate,
            error=error,
        )
        self.db.add(run)
        self.db.add(AgentTrace(run_id=ctx.run_id, agent_name=self.agent.name, trace=ctx.trace.snapshot()))
        self.db.commit()
        return run

    # ---- 主入口 ----

    def run(
        self,
        *,
        task_description: str,
        user_input: str,
        context: dict,
        executor: Executor | None,
        strategy_name: str | None = None,
        source_text: str = "",
        with_quality_gate: bool = True,
        ctx: RunContext | None = None,
        call_type: str = "invoke",
    ) -> dict:
        """执行管道主入口。返回 {output, run_id, gate, decision}。"""
        self._assert_executable()
        ctx = ctx or RunContext(
            run_id=uuid.uuid4().hex[:16],
            agent_name=self.agent.name,
            strategy=strategy_name or self.agent.strategy,
            model=(self.agent.config or {}).get("model") or None,
        )
        guard = self._build_guard()

        # 生成阶段：定义为可重复调用的闭包，供质量门禁 RETRY 重新生成
        def _generate(review_feedback: str = "") -> dict:
            if executor is not None:
                # 业务处理器路径：把评审反馈写入 ctx 供处理器读取
                if review_feedback:
                    ctx.review_feedback = review_feedback
                return executor(ctx, guard)
            # 通用策略图路径
            extra_context = json.dumps(context, ensure_ascii=False)[:1500]
            if review_feedback:
                extra_context += "\n\n" + review_feedback
            strategy = get_strategy(strategy_name or self.agent.strategy)
            system_prompt = self._build_system_prompt(extra_context)
            return strategy.run(
                system_prompt=system_prompt,
                user_input=user_input,
                context=context,
                ctx=ctx,
                guard=guard,
            )

        retry_count = 0
        max_retries = self.gate.max_retries
        try:
            result = _generate()
            ctx.trace.final_output = result if isinstance(result, dict) else {"output": str(result)}
        except Exception as exc:
            logger.error("Agent %s 执行失败: %s", self.agent.name, exc)
            ctx.trace.add_event("run_error", {"error": str(exc)[:500]})
            self._persist(ctx, "", task_description, "error", {}, error=str(exc), call_type=call_type)
            audit("agent.run.error", f"agent:{self.agent.name}", {"run_id": ctx.run_id, "error": str(exc)}, db=self.db)
            raise

        output_text = result.get("output") if isinstance(result, dict) else str(result)
        if not isinstance(output_text, str):
            output_text = json.dumps(output_text, ensure_ascii=False)

        # 验证与质量：宪法校验 + 评审门禁；RETRY 有界重试，DEGRADE 降级展示
        gate: dict = {}
        decision = GateDecision.PASS
        verdict: ReviewVerdict | None = None
        if with_quality_gate and self.agent.name != "reviewer":
            while True:
                decision, gate, verdict = self._gate_output(
                    output_text, task_description, source_text, retry_count=retry_count
                )
                if decision == GateDecision.REJECT:
                    break
                if decision == GateDecision.RETRY and retry_count < max_retries:
                    retry_count += 1
                    feedback = self._build_review_feedback(verdict)
                    logger.info("质量门禁触发重试 (%d/%d): agent=%s", retry_count, max_retries, self.agent.name)
                    try:
                        result = _generate(review_feedback=feedback)
                    except Exception as exc:
                        logger.error("Agent %s 重试生成失败: %s", self.agent.name, exc)
                        audit("agent.run.retry_error", f"agent:{self.agent.name}", {"run_id": ctx.run_id, "error": str(exc)}, db=self.db)
                        break
                    output_text = result.get("output") if isinstance(result, dict) else str(result)
                    if not isinstance(output_text, str):
                        output_text = json.dumps(output_text, ensure_ascii=False)
                    ctx.trace.final_output = result if isinstance(result, dict) else {"output": str(result)}
                    continue  # 用新输出重新走门禁
                break  # PASS 或 DEGRADE（或重试耗尽后的 DEGRADE/REJECT）

            if verdict is not None:
                result["review"] = {
                    "score": verdict.score,
                    "dimensions": verdict.dimensions,
                    "strengths": verdict.strengths,
                    "issues": verdict.issues,
                    "suggestions": verdict.suggestions,
                }
            if decision == GateDecision.REJECT:
                self._persist(ctx, output_text, task_description, "rejected", gate, call_type=call_type)
                audit("agent.run.rejected", f"agent:{self.agent.name}", {"run_id": ctx.run_id, "gate": gate}, db=self.db)
                raise ClosedLoopError(f"Agent「{self.agent.name}」输出未通过质量门禁：{gate}")
            if decision == GateDecision.DEGRADE:
                result["degraded"] = True
                audit("agent.run.degraded", f"agent:{self.agent.name}", {"run_id": ctx.run_id, "gate": gate, "score": verdict.score if verdict else None}, db=self.db)

        result["gate"] = gate
        result["decision"] = decision.value
        result["run_id"] = ctx.run_id

        self._persist(ctx, output_text, task_description, "success", gate, call_type=call_type)
        audit("agent.run", f"agent:{self.agent.name}", {"run_id": ctx.run_id, "decision": decision.value}, db=self.db)
        return result


def run_agent_task(
    agent_name: str,
    task_description: str,
    user_input: str,
    context: dict | None = None,
    executor: Executor | None = None,
    strategy_name: str | None = None,
    source_text: str = "",
    with_quality_gate: bool = True,
    ctx: RunContext | None = None,
    call_type: str = "invoke",
    request_id: str | None = None,
) -> dict:
    """便捷入口：按 Agent 名称执行（Workbench 子任务分发时使用）。

    request_id 用于把顶层请求的链路 ID 透传到子 Agent 任务（如 Workbench
    分发），保证跨 Agent 的 Trace 能按同一请求串联。
    """
    with SessionLocal() as db:
        agent = db.query(Agent).filter(Agent.name == agent_name).first()
        if agent is None:
            raise NotFoundError(f"Agent「{agent_name}」不存在")
        runtime = AgentRuntime(agent, db)
        if ctx is None and request_id is not None:
            ctx = RunContext(
                run_id=uuid.uuid4().hex[:16],
                agent_name=agent_name,
                strategy=strategy_name or agent.strategy,
                request_id=request_id,
                model=(agent.config or {}).get("model") or None,
            )
        return runtime.run(
            task_description=task_description,
            user_input=user_input,
            context=context or {},
            executor=executor,
            strategy_name=strategy_name,
            source_text=source_text,
            with_quality_gate=with_quality_gate,
            ctx=ctx,
            call_type=call_type,
        )
