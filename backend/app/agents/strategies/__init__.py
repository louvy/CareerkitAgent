"""策略工厂：按名称实例化策略。"""

from app.agents.strategies.base import AgentStrategy
from app.agents.strategies.plan_execute import PlanExecuteStrategy
from app.agents.strategies.react import ReActStrategy
from app.agents.strategies.simple_chat import SimpleChatStrategy
from app.agents.strategies.workbench import WorkbenchStrategy

STRATEGIES = {
    "simple_chat": SimpleChatStrategy,
    "react": ReActStrategy,
    "plan_execute": PlanExecuteStrategy,
    "workbench": WorkbenchStrategy,
}


def get_strategy(name: str) -> AgentStrategy:
    cls = STRATEGIES.get(name)
    if cls is None:
        raise ValueError(f"未知策略: {name}，可选: {list(STRATEGIES)}")
    return cls()
