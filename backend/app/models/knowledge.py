"""知识库模型：pgvector 向量存储（替代 Milvus 的矢量层）。"""

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import settings
from app.models.base import Base

# 向量列维度：必须与所选 embedding 模型输出维度一致，否则入库会失败或静默丢向量。
# 上传时在路由层校验维度匹配（见 api/routes/knowledge.py）。
EMBEDDING_DIM = settings.embedding_dim


class KnowledgeBase(Base):
    """知识库：用户可创建多个库并绑定到 Agent。"""

    __tablename__ = "knowledge_bases"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    # 切块策略：auto（段落感知）/ fixed（纯固定窗口）
    chunk_strategy: Mapped[str] = mapped_column(String(16), default="auto")
    chunk_size: Mapped[int] = mapped_column(Integer, default=800)
    chunk_overlap: Mapped[int] = mapped_column(Integer, default=100)
    # 向量化使用的 embedding 模型（空则用全局默认 embedding 模型）
    embedding_model_id: Mapped[int | None] = mapped_column(
        ForeignKey("llm_models.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    chunks: Mapped[list["KnowledgeChunk"]] = relationship(
        back_populates="knowledge_base", cascade="all, delete-orphan"
    )


class KnowledgeChunk(Base):
    """文档分片：原文 + 向量 + 元数据。"""

    __tablename__ = "knowledge_chunks"

    id: Mapped[int] = mapped_column(primary_key=True)
    knowledge_base_id: Mapped[int] = mapped_column(
        ForeignKey("knowledge_bases.id", ondelete="CASCADE"), index=True
    )
    # MinIO 中的原始文件对象名
    source_file: Mapped[str] = mapped_column(String(255), default="")
    # 分片在源文档中的序号
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM))
    # 元数据：{title, section, page}（列名 metadata 为保留字，属性名用 doc_meta）
    doc_meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    knowledge_base: Mapped[KnowledgeBase] = relationship(back_populates="chunks")
