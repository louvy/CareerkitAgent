"""工具库模型：http / mcp 两类自定义工具（AgentForge Tool Library 简化版）。"""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Tool(Base):
    """自定义工具条目。config 按分类存储：
    - http: {method, url, headers, body}
    - mcp:  {command, args, env}
    """

    __tablename__ = "tools"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 唯一工具名（Agent 白名单可引用）
    name: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    # http / mcp
    category: Mapped[str] = mapped_column(String(16), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
