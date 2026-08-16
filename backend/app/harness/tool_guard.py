"""工具白名单（ToolGuard）：Agent 只能调用被授权挂载的工具。

参考 AgentForge 的「工具挂载」机制：每个 Agent 配置声明工具列表，
实际调用时经守卫校验，未授权调用直接拒绝并写入审计。
"""

import logging
from collections.abc import Callable

from app.core.exceptions import ToolGuardError

logger = logging.getLogger("careerkit.toolguard")

# 系统内置工具注册表：name -> 可调用对象
_TOOL_REGISTRY: dict[str, Callable] = {}


def register_tool(arg: str | Callable) -> Callable:
    """注册工具，支持两种用法：

    - ``@register_tool``：以函数名注册
    - ``@register_tool("custom_name")``：以指定名称注册
    """
    if callable(arg):
        fn = arg
        _TOOL_REGISTRY[fn.__name__] = fn
        return fn

    name = arg

    def wrapper(fn: Callable) -> Callable:
        _TOOL_REGISTRY[name] = fn
        return fn

    return wrapper


def get_registered_tool(name: str) -> Callable:
    if name not in _TOOL_REGISTRY:
        raise ToolGuardError(f"工具「{name}」未注册。")
    return _TOOL_REGISTRY[name]


def list_registered_tools() -> list[str]:
    return sorted(_TOOL_REGISTRY.keys())


class ToolGuard:
    """每个 Agent 运行时实例持有自己的白名单。"""

    def __init__(self, agent_name: str, allowed_tools: list[str]):
        self.agent_name = agent_name
        self.allowed = set(allowed_tools)

    def assert_allowed(self, tool_name: str) -> None:
        if tool_name not in self.allowed:
            logger.warning("ToolGuard 拒绝 %s 调用未授权工具 %s", self.agent_name, tool_name)
            raise ToolGuardError(
                f"Agent「{self.agent_name}」无权调用工具「{tool_name}」，"
                f"该工具不在其白名单 {sorted(self.allowed)} 中。"
            )

    def invoke(self, tool_name: str, **kwargs):
        """校验后调用工具；参数与结果由调用方负责写入 Trace。"""
        self.assert_allowed(tool_name)
        fn = get_registered_tool(tool_name)
        return fn(**kwargs)
