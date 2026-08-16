"""简历相关结构化输出模型（LLM 输出的 schema 校验层）。"""

from pydantic import BaseModel, Field


class DiagnosisIssue(BaseModel):
    """一条诊断问题：必须带段落定位与原文证据（宪法 DIAGNOSIS_EVIDENCE）。"""

    section: str = Field(description="问题所在简历段落，如「项目经历」")
    title: str = Field(description="问题标题，一句话概括")
    detail: str = Field(description="问题详细说明")
    evidence: str = Field(description="原文证据摘录，无证据必须填空字符串")
    suggestion: str = Field(description="改进方向建议")


class ResumeDiagnosis(BaseModel):
    """简历诊断输出：不修改原文，只返回诊断。"""

    overview: str = Field(description="诊断概览，2-3 句话")
    strengths: list[str] = Field(description="现有优势，3-5 条")
    issues: list[DiagnosisIssue] = Field(description="问题清单，最多 12 条")
    # 缺失事实标记：AI 不得补全，引导用户回编辑器确认
    missing_facts: list[str] = Field(default_factory=list, description="需要用户确认的缺失事实（GPA/日期/数据等）")


class SectionSuggestion(BaseModel):
    """分节优化建议：原文 vs 建议，供用户逐条接受/拒绝/编辑。"""

    section: str = Field(description="段落名")
    original: str = Field(description="原文片段")
    suggestion: str = Field(description="AI 改写建议")
    reason: str = Field(description="改写理由")
    is_inference: bool = Field(default=False, description="是否为推断性补充（须标 [推断]）")


class OptimizationSuggestions(BaseModel):
    """简历优化输出：逐条建议，未获用户确认前不写入任何版本。"""

    summary: str = Field(description="整体优化说明")
    suggestions: list[SectionSuggestion] = Field(description="分节建议清单")
    notes: list[str] = Field(default_factory=list, description="其他说明（如缺失事实提醒）")
