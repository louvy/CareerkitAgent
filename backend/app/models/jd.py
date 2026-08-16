"""JD（职位描述）与匹配结果模型。"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class JD(Base):
    """用户粘贴的完整职位描述。"""

    __tablename__ = "jds"

    id: Mapped[int] = mapped_column(primary_key=True)
    company: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(120))
    content: Mapped[str] = mapped_column(Text)  # 完整 JD 原文
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    matches: Mapped[list["JDMatch"]] = relationship(back_populates="jd", cascade="all, delete-orphan")


class JDMatch(Base):
    """一次 JD 匹配结果：诊断 + 建议 + 生成的定向简历版本。"""

    __tablename__ = "jd_matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    jd_id: Mapped[int] = mapped_column(ForeignKey("jds.id", ondelete="CASCADE"), index=True)
    resume_version_id: Mapped[int | None] = mapped_column(ForeignKey("resume_versions.id"))
    result_version_id: Mapped[int | None] = mapped_column(ForeignKey("resume_versions.id"))
    # 匹配度概览：{overall, per_requirement:[{requirement,evidence,score,gap}]}
    overview: Mapped[dict] = mapped_column(JSONB, default=dict)
    # 建议：{reorder:[...], wording:[...], matched_strengths:[...]}
    suggestions: Mapped[dict] = mapped_column(JSONB, default=dict)
    # 质量门禁记录
    gate: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    jd: Mapped[JD] = relationship(back_populates="matches")
