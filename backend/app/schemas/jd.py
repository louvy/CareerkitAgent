"""JD 匹配结构化输出模型。"""

from pydantic import BaseModel, Field


class RequirementEvidence(BaseModel):
    """JD 单条要求与简历证据的匹配诊断。"""

    requirement: str = Field(description="JD 要求原文")
    evidence: str = Field(description="简历中的对应证据；无证据填「无直接证据」")
    score: float = Field(ge=0, le=10, description="匹配度 0-10")
    gap: str = Field(description="差距说明与弥补方向")


class JDMatchResult(BaseModel):
    """JD 匹配 Agent 输出：诊断 + 建议。"""

    overall_score: float = Field(ge=0, le=10, description="整体匹配度")
    summary: str = Field(description="匹配概况，2-3 句话")
    per_requirement: list[RequirementEvidence] = Field(description="逐条要求匹配诊断")
    reorder: list[str] = Field(description="简历内容重排建议（按 JD 关键词优先级）")
    wording: list[str] = Field(description="措辞优化建议（不虚构经历）")
    matched_strengths: list[str] = Field(description="可强调的已有优势")
    missing_facts: list[str] = Field(default_factory=list, description="JD 要求但简历缺失的事实，需用户补充")
