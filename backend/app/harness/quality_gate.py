"""质量门禁（Quality Gate）：生成/评估分离，业务输出经评审 Agent 把关。

参考 AgentForge Harness「生成/评估分离」：业务 Agent 与评审 Agent 使用
独立上下文 Persona，评审低于阈值时触发重试或降级展示。
"""

import logging
from dataclasses import dataclass, field
from enum import Enum

from app.config import settings

logger = logging.getLogger("careerkit.quality")

QUALITY_DIMENSIONS = ("fact_accuracy", "relevance", "actionability", "clarity", "constitution")


class GateDecision(str, Enum):
    PASS = "pass"          # 通过：输出可用
    RETRY = "retry"        # 重试：可修复问题，触发同 Agent 重跑
    DEGRADE = "degrade"    # 降级：输出保留但标记为低质量，附评审意见
    REJECT = "reject"      # 拒绝：宪法级违规，输出不落地


@dataclass
class ReviewVerdict:
    """评审 Agent 的结构化结论。"""

    score: float  # 0-10
    dimensions: dict[str, float] = field(default_factory=dict)
    strengths: list[str] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)


class QualityGate:
    """根据评审结论做出门禁决策。"""

    def __init__(self, threshold: float | None = None, max_retries: int = 2):
        self.threshold = threshold if threshold is not None else settings.quality_gate_threshold
        self.max_retries = max_retries

    def decide(self, verdict: ReviewVerdict, *, retry_count: int = 0, has_constitution_error: bool = False) -> GateDecision:
        if has_constitution_error:
            return GateDecision.REJECT
        if verdict.score >= self.threshold:
            return GateDecision.PASS
        if retry_count < self.max_retries:
            return GateDecision.RETRY
        # 重试耗尽：允许降级展示（保留输出+评审意见），不让用户空手而归
        if verdict.score >= self.threshold * 0.6:
            return GateDecision.DEGRADE
        return GateDecision.REJECT

    def run(self, verdict: ReviewVerdict, *, retry_count: int = 0, has_constitution_error: bool = False) -> tuple[GateDecision, dict]:
        """执行门禁并记录日志。返回（决策，门禁记录）。"""
        decision = self.decide(verdict, retry_count=retry_count, has_constitution_error=has_constitution_error)
        record = {
            "decision": decision.value,
            "score": verdict.score,
            "threshold": self.threshold,
            "dimensions": verdict.dimensions,
            "retry_count": retry_count,
        }
        logger.info("QualityGate agent_score=%.1f threshold=%.1f decision=%s", verdict.score, self.threshold, decision.value)
        return decision, record
