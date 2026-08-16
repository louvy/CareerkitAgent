"""简历与简历版本模型。"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Resume(Base):
    """简历实体：多版本共享一份元数据。"""

    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))  # 如「后端工程师 - 主版本」
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    versions: Mapped[list["ResumeVersion"]] = relationship(
        back_populates="resume", cascade="all, delete-orphan", order_by="ResumeVersion.id"
    )


class ResumeVersion(Base):
    """简历版本：JSONB 存储结构化内容；type 区分普通/JD 优化/通用优化。"""

    __tablename__ = "resume_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    resume_id: Mapped[int] = mapped_column(ForeignKey("resumes.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(120))
    # general=通用版本 jd=JD定向优化 experimental=实验副本
    version_type: Mapped[str] = mapped_column(String(24), default="general")
    # 结构化简历内容：{sections:[{type,title,items:[...]}], template, theme}
    content: Mapped[dict] = mapped_column(JSONB, default=dict)
    # 生成说明（AI 优化时记录依据与用户确认）
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    resume: Mapped[Resume] = relationship(back_populates="versions")

    @property
    def plain_text(self) -> str:
        """扁平化文本：供 RAG 切分与宪法校验使用。"""
        parts: list[str] = []
        for section in (self.content or {}).get("sections", []):
            parts.append(section.get("title", ""))
            for item in section.get("items", []):
                if isinstance(item, dict):
                    parts.append(" ".join(str(v) for v in item.values() if v))
                else:
                    parts.append(str(item))
        return "\n".join(parts)
