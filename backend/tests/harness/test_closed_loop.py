"""闭环状态机（ClosedLoop）单元测试：合法流转与非法流转拒绝。"""

import pytest

from app.core.exceptions import ClosedLoopError
from app.harness.closed_loop import AgentStatus, ClosedLoop


class TestClosedLoopTransitions:
    def test_valid_flow(self):
        status = AgentStatus.DRAFT
        status = ClosedLoop.transition(status, AgentStatus.CONFIGURED)
        status = ClosedLoop.transition(status, AgentStatus.REVIEWED)
        status = ClosedLoop.transition(status, AgentStatus.ENABLED)
        assert status == AgentStatus.ENABLED

    def test_skip_review_rejected(self):
        """跳过审查（configured -> enabled）必须被拒绝。"""
        with pytest.raises(ClosedLoopError):
            ClosedLoop.transition(AgentStatus.CONFIGURED, AgentStatus.ENABLED)

    def test_direct_enable_rejected(self):
        """草稿直接启用必须被拒绝。"""
        with pytest.raises(ClosedLoopError):
            ClosedLoop.transition(AgentStatus.DRAFT, AgentStatus.ENABLED)

    def test_rollback_to_draft(self):
        """configured/reviewed 可回退草稿重新配置。"""
        status = ClosedLoop.transition(AgentStatus.CONFIGURED, AgentStatus.DRAFT)
        assert status == AgentStatus.DRAFT
        status = ClosedLoop.transition(AgentStatus.REVIEWED, AgentStatus.DRAFT)
        assert status == AgentStatus.DRAFT

    def test_disable_and_reenable(self):
        status = ClosedLoop.transition(AgentStatus.ENABLED, AgentStatus.DISABLED)
        assert status == AgentStatus.DISABLED
        status = ClosedLoop.transition(status, AgentStatus.ENABLED)
        assert status == AgentStatus.ENABLED

    def test_reconfigure_from_any_state(self):
        """任意状态均可保存配置回到 configured（配置变更须重新审查）。"""
        for current in (AgentStatus.CONFIGURED, AgentStatus.REVIEWED, AgentStatus.ENABLED, AgentStatus.DISABLED):
            status = ClosedLoop.transition(current, AgentStatus.CONFIGURED)
            assert status == AgentStatus.CONFIGURED


class TestClosedLoopExecutable:
    def test_only_enabled_executable(self):
        ClosedLoop.assert_executable(AgentStatus.ENABLED)

    @pytest.mark.parametrize(
        "status",
        [AgentStatus.DRAFT, AgentStatus.CONFIGURED, AgentStatus.REVIEWED, AgentStatus.DISABLED],
    )
    def test_non_enabled_not_executable(self, status):
        with pytest.raises(ClosedLoopError):
            ClosedLoop.assert_executable(status)

    def test_unknown_status_rejected(self):
        with pytest.raises(ValueError):
            AgentStatus("unknown")
