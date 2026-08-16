"""Agent 控制台 API：闭环状态机强制 + 运行历史 + Trace 查看。"""

import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.agents.runtime import run_agent_task
from app.core.deps import get_db
from app.core.exceptions import NotFoundError
from app.core.middleware import request_id_var
from app.harness.closed_loop import AgentStatus, ClosedLoop
from app.models.agent import Agent, AgentRun, AgentTrace
from app.schemas.agent import AgentConfigIn
from app.services.audit import audit

router = APIRouter(prefix="/api", tags=["agents"])

# 可用的系统工具（供前端白名单勾选）
AVAILABLE_TOOLS = ["get_resume", "get_jd", "search_knowledge", "export_docx"]


def _get_agent(db: Session, agent_id: int) -> Agent:
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise NotFoundError(f"Agent {agent_id} 不存在")
    return agent


def _agent_dict(agent: Agent) -> dict:
    return {
        "id": agent.id,
        "name": agent.name,
        "display_name": agent.display_name,
        "description": agent.description,
        "strategy": agent.strategy,
        "is_builtin": agent.is_builtin,
        "status": agent.status,
        "config": agent.config,
        "knowledge_base_ids": agent.knowledge_base_ids,
        "created_at": agent.created_at,
        "updated_at": agent.updated_at,
    }


@router.get("/agents")
def list_agents(db: Session = Depends(get_db)):
    agents = db.query(Agent).order_by(Agent.id.asc()).all()
    return [_agent_dict(a) for a in agents]


@router.get("/agents/tools")
def list_tools():
    return {"tools": AVAILABLE_TOOLS}


@router.get("/agents/{agent_id}")
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    return _agent_dict(_get_agent(db, agent_id))


@router.put("/agents/{agent_id}/config")
def configure_agent(agent_id: int, payload: AgentConfigIn, db: Session = Depends(get_db)):
    """配置 Agent：draft → configured（闭环强制，须从合法状态流转）。"""
    agent = _get_agent(db, agent_id)
    status = AgentStatus(agent.status)
    ClosedLoop.transition(status, AgentStatus.CONFIGURED)

    config = dict(agent.config or {})
    if payload.display_name is not None:
        agent.display_name = payload.display_name
    if payload.description is not None:
        agent.description = payload.description
    if payload.strategy is not None:
        agent.strategy = payload.strategy
    if payload.system_prompt is not None:
        config["system_prompt"] = payload.system_prompt
    if payload.model is not None:
        config["model"] = payload.model
    if payload.temperature is not None:
        config["temperature"] = payload.temperature
    if payload.top_p is not None:
        config["top_p"] = payload.top_p
    if payload.max_tokens is not None:
        config["max_tokens"] = payload.max_tokens
    if payload.allowed_tools is not None:
        config["allowed_tools"] = payload.allowed_tools
    if payload.knowledge_base_ids is not None:
        agent.knowledge_base_ids = payload.knowledge_base_ids
    agent.config = config
    agent.status = AgentStatus.CONFIGURED.value
    db.commit()
    audit("agent.config", f"agent:{agent.name}", {"agent_id": agent_id}, db=db)
    return _agent_dict(agent)


@router.post("/agents/{agent_id}/review")
def review_agent(agent_id: int, db: Session = Depends(get_db)):
    """审查 Agent 配置：configured → reviewed（生成/评估分离，人工确认）。"""
    agent = _get_agent(db, agent_id)
    status = AgentStatus(agent.status)
    ClosedLoop.transition(status, AgentStatus.REVIEWED)
    agent.status = AgentStatus.REVIEWED.value
    db.commit()
    audit("agent.review", f"agent:{agent.name}", {"agent_id": agent_id}, db=db)
    return _agent_dict(agent)


@router.post("/agents/{agent_id}/enable")
def enable_agent(agent_id: int, db: Session = Depends(get_db)):
    """启用 Agent：reviewed → enabled（此后才可被调度）。"""
    agent = _get_agent(db, agent_id)
    status = AgentStatus(agent.status)
    ClosedLoop.transition(status, AgentStatus.ENABLED)
    agent.status = AgentStatus.ENABLED.value
    db.commit()
    audit("agent.enable", f"agent:{agent.name}", {"agent_id": agent_id}, db=db)
    return _agent_dict(agent)


@router.post("/agents/{agent_id}/disable")
def disable_agent(agent_id: int, db: Session = Depends(get_db)):
    """停用 Agent：enabled → disabled。"""
    agent = _get_agent(db, agent_id)
    status = AgentStatus(agent.status)
    ClosedLoop.transition(status, AgentStatus.DISABLED)
    agent.status = AgentStatus.DISABLED.value
    db.commit()
    audit("agent.disable", f"agent:{agent.name}", {"agent_id": agent_id}, db=db)
    return _agent_dict(agent)


@router.post("/agents/{agent_id}/run")
def run_agent(agent_id: int, payload: dict, db: Session = Depends(get_db)):
    """通用运行入口：输入 {user_input, context?, call_type?}，走 Harness 管道。"""
    agent = _get_agent(db, agent_id)
    user_input = str(payload.get("user_input", ""))
    context = payload.get("context") or {}
    result = run_agent_task(
        agent.name,
        task_description=f"通用运行 agent:{agent.name}",
        user_input=user_input,
        context=context,
        source_text=str(context.get("source_text", "")),
        with_quality_gate=payload.get("with_quality_gate", True),
        call_type=str(payload.get("call_type", "invoke")),
        request_id=request_id_var.get(),
    )
    return result


@router.get("/agent-runs")
def list_runs(agent_id: int | None = None, limit: int = 100, db: Session = Depends(get_db)):
    """运行历史（链路追踪列表）：含调用方式、耗时、状态、执行时间。"""
    query = db.query(AgentRun)
    if agent_id:
        query = query.filter(AgentRun.agent_id == agent_id)
    runs = query.order_by(AgentRun.id.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "run_id": r.run_id,
            "agent_id": r.agent_id,
            "agent_name": r.agent.name if r.agent else "",
            "call_type": r.call_type,
            "status": r.status,
            "input_summary": r.input_summary,
            "output_summary": r.output_summary,
            "stats": r.stats,
            "gate": r.gate,
            "error": r.error,
            "created_at": r.created_at,
        }
        for r in runs
    ]


@router.get("/agent-runs/{run_id}/trace")
def get_trace(run_id: str, db: Session = Depends(get_db)):
    trace = db.query(AgentTrace).filter(AgentTrace.run_id == run_id).first()
    if trace is None:
        raise NotFoundError(f"Trace {run_id} 不存在")
    return {"run_id": trace.run_id, "agent_name": trace.agent_name, "trace": trace.trace, "created_at": trace.created_at}
