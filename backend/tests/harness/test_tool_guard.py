"""工具白名单（ToolGuard）单元测试：授权校验与未注册工具拒绝。"""

import pytest

from app.core.exceptions import ToolGuardError
from app.harness.tool_guard import ToolGuard, get_registered_tool, list_registered_tools, register_tool


@pytest.fixture(autouse=True)
def _register_dummy_tool():
    """注册一个测试用工具。"""

    @register_tool
    def echo(text: str = "") -> str:
        return text

    yield
    # 清理测试工具，避免影响其他用例
    from app.harness import tool_guard as tg

    tg._TOOL_REGISTRY.pop("echo", None)


class TestToolGuard:
    def test_allowed_tool_invoked(self):
        guard = ToolGuard("test-agent", ["echo"])
        assert guard.invoke("echo", text="hi") == "hi"

    def test_unauthorized_tool_rejected(self):
        guard = ToolGuard("test-agent", [])
        with pytest.raises(ToolGuardError):
            guard.invoke("echo", text="hi")

    def test_tool_not_in_agent_whitelist(self):
        """工具已注册但不在该 Agent 白名单中：同样拒绝。"""
        guard = ToolGuard("test-agent", ["other_tool"])
        with pytest.raises(ToolGuardError):
            guard.invoke("echo")

    def test_unregistered_tool_rejected(self):
        guard = ToolGuard("test-agent", ["ghost"])
        with pytest.raises(ToolGuardError):
            guard.invoke("ghost")

    def test_registry_listing(self):
        assert "echo" in list_registered_tools()

    def test_named_registration(self):
        register_tool("named_tool")(lambda: "ok")
        assert get_registered_tool("named_tool")() == "ok"
