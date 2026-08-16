"""Agent 配置、运行实例与 Trace 持久化模型。"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Agent(Base):
    """Agent 定义。生命周期状态机由 harness.closed_loop 强制。"""

    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    # simple_chat / react / plan_execute / workbench
    strategy: Mapped[str] = mapped_column(String(32), default="react")
    # 是否内置（内置不可删除）
    is_builtin: Mapped[bool] = mapped_column(default=False)
    # 闭环状态机状态：draft/configured/reviewed/enabled/disabled
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True)
    # 配置：{model, temperature, top_p, max_tokens, system_prompt, knowledge_base_ids, allowed_tools}
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    # 挂载的知识库
    knowledge_base_ids: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    runs: Mapped[list["AgentRun"]] = relationship(back_populates="agent", cascade="all, delete-orphan")


class AgentRun(Base):
    """一次 Agent 执行实例：可观测汇总数据。"""

    __tablename__ = "agent_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    request_id: Mapped[str] = mapped_column(String(32), index=True)
    # 调用方式：invoke / stream（链路追踪列表展示）
    call_type: Mapped[str] = mapped_column(String(16), default="invoke", index=True)
    status: Mapped[str] = mapped_column(String(24), default="running")  # running/success/error/rejected
    input_summary: Mapped[str] = mapped_column(Text, default="")
    output_summary: Mapped[str] = mapped_column(Text, default="")
    # 汇总统计：{elapsed_ms, token_input, token_output, llm_calls, tool_calls}
    stats: Mapped[dict] = mapped_column(JSONB, default=dict)
    # 质量门禁记录
    gate: Mapped[dict] = mapped_column(JSONB, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    agent: Mapped[Agent] = relationship(back_populates="runs")


class AgentTrace(Base):
    """Trace 持久化：完整事件流，支持回放调试。"""

    __tablename__ = "agent_traces"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.run_id", ondelete="CASCADE"), unique=True)
    agent_name: Mapped[str] = mapped_column(String(80), index=True)
    # TraceCollector.snapshot(): {events:[...], prompts:[...], final_output}
    trace: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
