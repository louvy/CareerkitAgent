"""钩子（Hooks）：LangGraph 生命周期埋点，实现可观测性与治理。

参考 AgentForge Harness「钩子机制」：Agent 的每个节点执行、工具调用、
状态转换都经过钩子记录 Trace、Token、耗时与审计事件。
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from app.core.middleware import redact, request_id_var
from app.harness.constitution import ConstitutionViolation, validate_output
from app.observability.tracing import TraceCollector

logger = logging.getLogger("careerkit.hooks")


@dataclass
class RunContext:
    """一次 Agent 运行的可观测上下文，贯穿图执行全过程。"""

    run_id: str
    agent_name: str
    strategy: str
    request_id: str = field(default_factory=lambda: request_id_var.get())
    trace: TraceCollector = field(default_factory=TraceCollector)
    started_at: float = field(default_factory=time.perf_counter)
    token_input: int = 0
    token_output: int = 0
    llm_calls: int = 0
    tool_calls: list[dict] = field(default_factory=list)
    # Agent 配置的模型名（覆盖全局默认 chat 模型）
    model: str | None = None

    def add_tool_call(self, name: str, args: dict, result: Any, ok: bool = True) -> None:
        self.tool_calls.append(
            {"name": name, "args": redact(args), "result": redact(result)[:2000] if isinstance(result, str) else redact(result), "ok": ok}
        )
        self.trace.add_event("tool_call", {"name": name, "ok": ok})

    def add_llm(self, input_tokens: int, output_tokens: int, model: str) -> None:
        self.token_input += input_tokens
        self.token_output += output_tokens
        self.llm_calls += 1
        self.trace.add_event("llm_call", {"model": model, "input_tokens": input_tokens, "output_tokens": output_tokens})

    @property
    def elapsed_ms(self) -> float:
        return (time.perf_counter() - self.started_at) * 1000

    def to_summary(self) -> dict:
        return {
            "run_id": self.run_id,
            "agent": self.agent_name,
            "strategy": self.strategy,
            "request_id": self.request_id,
            "elapsed_ms": round(self.elapsed_ms, 1),
            "token_input": self.token_input,
            "token_output": self.token_output,
            "llm_calls": self.llm_calls,
            "tool_calls": self.tool_calls,
        }


def run_constitution_check(
    text: str, *, source_text: str = "", facts: list[str] | None = None
) -> list[ConstitutionViolation]:
    """执行宪法校验并记录违规（含疑似虚构），供质量门禁决策。"""
    violations = validate_output(text, source_text=source_text, facts=facts)
    for v in violations:
        logger.warning("宪法校验违规 rule=%s severity=%s msg=%s", v.rule_id, v.severity, v.message)
    return violations
