"""模型管理：chat / embedding 分类，API Key 加密存储，支持连接测试与默认模型。"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LLMModel(Base):
    """LLM 模型条目。category 区分 chat（Agent 可选）与 embedding（知识库向量化）。"""

    __tablename__ = "llm_models"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 展示名称（如 "GPT-4o mini"）
    name: Mapped[str] = mapped_column(String(120))
    # chat / embedding
    category: Mapped[str] = mapped_column(String(16), index=True)
    # 供应商实际模型名（如 gpt-4o-mini / text-embedding-3-small）
    model: Mapped[str] = mapped_column(String(120))
    base_url: Mapped[str] = mapped_column(String(255), default="")
    # Fernet 加密后的 API Key（明文不落库）
    api_key: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    # 每分类至多一个默认模型；chat 默认模型供 Agent 运行时兜底，embedding 默认供知识库向量化
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
