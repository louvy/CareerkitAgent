"""闭环流程（Closed-loop）：Agent 生命周期状态机强制。

参考 AgentForge Harness「闭环强制」：Agent 必须按
    草稿 draft → 已配置 configured → 已审查 reviewed → 已启用 enabled
状态流转；已停用 disabled 可回到草稿重新配置。非法流转由后端强制拒绝。

配置变更（保存配置）可从任意状态进入 configured——配置不直接生效，
必须重新走 审查 → 启用 才可被调度，保证治理闭环。
"""

from enum import Enum

from app.core.exceptions import ClosedLoopError


class AgentStatus(str, Enum):
    DRAFT = "draft"
    CONFIGURED = "configured"
    REVIEWED = "reviewed"
    ENABLED = "enabled"
    DISABLED = "disabled"


# 合法状态流转表（configured 自环与回退：任意状态均可保存配置重新审查）
_TRANSITIONS: dict[AgentStatus, set[AgentStatus]] = {
    AgentStatus.DRAFT: {AgentStatus.CONFIGURED},
    AgentStatus.CONFIGURED: {AgentStatus.REVIEWED, AgentStatus.DRAFT, AgentStatus.CONFIGURED},
    AgentStatus.REVIEWED: {AgentStatus.ENABLED, AgentStatus.DRAFT, AgentStatus.CONFIGURED},
    AgentStatus.ENABLED: {AgentStatus.DISABLED, AgentStatus.CONFIGURED},
    AgentStatus.DISABLED: {AgentStatus.DRAFT, AgentStatus.ENABLED, AgentStatus.CONFIGURED},
}


class ClosedLoop:
    """闭环状态机：校验 Agent 状态流转与调度权限。"""

    @staticmethod
    def can_transition(current: AgentStatus, target: AgentStatus) -> bool:
        return target in _TRANSITIONS.get(current, set())

    @staticmethod
    def transition(current: AgentStatus, target: AgentStatus) -> AgentStatus:
        """执行状态流转，非法流转抛出 ClosedLoopError。"""
        if not ClosedLoop.can_transition(current, target):
            raise ClosedLoopError(
                f"闭环状态机拒绝流转: {current.value} → {target.value} 不在合法流转表中。"
            )
        return target

    @staticmethod
    def assert_executable(status: AgentStatus) -> None:
        """只有已启用的 Agent 才能被调度执行。"""
        if status != AgentStatus.ENABLED:
            raise ClosedLoopError(
                f"Agent 当前状态为 {status.value}，只有 enabled 状态的 Agent 才能被调度执行。"
            )
