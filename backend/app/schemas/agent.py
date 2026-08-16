"""Agent 相关结构化输出模型：评审（生成/评估分离）与运行。"""

from pydantic import BaseModel, Field


class ReviewVerdictModel(BaseModel):
    """评审 Agent 输出（Pydantic 版），转换为 harness.quality_gate.ReviewVerdict。"""

    score: float = Field(ge=0, le=10, description="总体评分 0-10")
    dimensions: dict[str, float] = Field(
        default_factory=dict,
        description="分维度评分：fact_accuracy/relevance/actionability/clarity/constitution",
    )
    strengths: list[str] = Field(default_factory=list, description="输出优点")
    issues: list[str] = Field(default_factory=list, description="发现的问题")
    suggestions: list[str] = Field(default_factory=list, description="改进建议")


class AgentConfigIn(BaseModel):
    """Agent 配置输入（配置控制台）。"""

    display_name: str | None = None
    description: str | None = None
    strategy: str | None = None
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    max_tokens: int | None = Field(default=None, ge=1)
    system_prompt: str | None = None
    allowed_tools: list[str] | None = None
    knowledge_base_ids: list[int] | None = None
