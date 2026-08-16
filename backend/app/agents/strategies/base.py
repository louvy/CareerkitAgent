"""策略基类：定义 Agent 执行策略的统一接口。"""

from abc import ABC, abstractmethod

from app.harness.hooks import RunContext
from app.harness.tool_guard import ToolGuard


class AgentStrategy(ABC):
    """策略抽象：SimpleChat / ReAct / PlanExecute / Workbench。"""

    @abstractmethod
    def run(
        self,
        *,
        system_prompt: str,
        user_input: str,
        context: dict,
        ctx: RunContext,
        guard: ToolGuard,
    ) -> dict:
        """执行策略，返回最终输出 dict。"""
