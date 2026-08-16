"""Harness 管道调用公共入口。

诊断 / 优化 / JD 匹配等路由共用「解析内置 Agent → 构建运行时 → 执行管道」
的样板，这里抽出避免三处重复。返回 AgentRuntime.run 的结果 dict。
"""

from sqlalchemy.orm import Session

from app.agents.runtime import AgentRuntime
from app.core.exceptions import NotFoundError


def run_harness_pipeline(
    db: Session,
    agent_name: str,
    *,
    task_description: str,
    user_input: str,
    context: dict,
    executor,
    source_text: str = "",
) -> dict:
    """执行内置 Agent 的 Harness 管道，返回 {output, run_id, gate, decision}。"""
    from app.models.agent import Agent

    agent = db.query(Agent).filter(Agent.name == agent_name).first()
    if agent is None:
        raise NotFoundError(f"内置 Agent {agent_name} 不存在")
    runtime = AgentRuntime(agent, db)
    return runtime.run(
        task_description=task_description,
        user_input=user_input,
        context=context,
        executor=executor,
        source_text=source_text,
    )
