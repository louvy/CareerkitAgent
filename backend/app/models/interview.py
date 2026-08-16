"""面试刷题相关模型：会话、题目、作答、复盘。"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class InterviewSession(Base):
    """一次面试刷题会话：基于简历+JD 出题。"""

    __tablename__ = "interview_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    resume_version_id: Mapped[int | None] = mapped_column(ForeignKey("resume_versions.id"))
    jd_id: Mapped[int | None] = mapped_column(ForeignKey("jds.id"))
    # 能力画像分组：{groups:[{name, questions:[...]}]}
    profile: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="active")  # active/completed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    questions: Mapped[list["InterviewQuestion"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="InterviewQuestion.order_no"
    )


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True)
    order_no: Mapped[int] = mapped_column(Integer, default=0)
    category: Mapped[str] = mapped_column(String(32))  # core_knowledge/project_deep_dive/behavioral
    question: Mapped[str] = mapped_column(Text)
    # 考察点与参考思路（AI 生成内容，标注 [推断] 来源）
    intent: Mapped[str] = mapped_column(Text, default="")
    reference_points: Mapped[dict] = mapped_column(JSONB, default=list)

    session: Mapped[InterviewSession] = relationship(back_populates="questions")


class InterviewAnswer(Base):
    """用户对某题的作答草稿。"""

    __tablename__ = "interview_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("interview_questions.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class InterviewReview(Base):
    """AI 复盘报告：评审 Agent 逐题评估的产出。"""

    __tablename__ = "interview_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True)
    # {overall:{score,summary}, per_question:[{question_id,score,strengths,weaknesses,suggestions,reference}]}
    report: Mapped[dict] = mapped_column(JSONB, default=dict)
    gate: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
