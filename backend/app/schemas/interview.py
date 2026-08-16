"""面试刷题结构化输出模型。"""

from pydantic import BaseModel, Field


class InterviewQuestionItem(BaseModel):
    """一道面试题。"""

    category: str = Field(description="题目分类：core_knowledge / project_deep_dive / behavioral")
    question: str = Field(description="题目文本")
    intent: str = Field(description="考察点说明")
    reference_points: list[str] = Field(default_factory=list, description="参考思路要点（[推断] 来源需标注）")


class InterviewQuestionGroup(BaseModel):
    name: str = Field(description="能力画像分组名，如「核心知识」「项目深挖」「行为面试」")
    questions: list[InterviewQuestionItem] = Field(description="该组题目")


class InterviewQuestionSet(BaseModel):
    """出题 Agent 输出：按能力画像分组。"""

    title: str = Field(description="面试会话标题")
    summary: str = Field(description="能力画像概览")
    groups: list[InterviewQuestionGroup] = Field(description="分组题目")


class ReviewPerQuestion(BaseModel):
    """单题复盘。"""

    question_id: int | None = None
    question: str = Field(description="题目")
    score: float = Field(ge=0, le=10, description="得分")
    strengths: list[str] = Field(default_factory=list, description="优点")
    weaknesses: list[str] = Field(default_factory=list, description="不足")
    suggestions: list[str] = Field(default_factory=list, description="改进方向")
    reference: str = Field(default="", description="参考要点（标注来源）")


class InterviewReviewReport(BaseModel):
    """复盘报告输出。"""

    overall_score: float = Field(ge=0, le=10, description="整体得分")
    summary: str = Field(description="整体评价")
    per_question: list[ReviewPerQuestion] = Field(description="逐题评估")
    next_steps: list[str] = Field(default_factory=list, description="下一步准备建议")
