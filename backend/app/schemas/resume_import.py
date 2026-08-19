"""简历导入的结构化输出模型（LLM 抽取校验层）。

与编辑器内部 `ResumeVersion.content` 结构对齐：
    {sections:[{type,title,items}], template, theme}
导入只重组已有文本，不虚构任何事实（对齐宪法 FACT_NO_FABRICATION）。
"""

from pydantic import BaseModel, Field


class ResumeSection(BaseModel):
    """一个简历区块。"""

    type: str = Field(default="custom", description="区块类型，固定取值：personal_info/summary/work_experience/education/projects/skills/certifications/languages/github/qr_codes/custom")
    title: str = Field(description="区块标题，如「项目经历」")
    items: list[str] = Field(default_factory=list, description="该区块下的要点/条目文本列表（字符串）")


class ResumeContent(BaseModel):
    """结构化简历内容（导入目标结构）。"""

    sections: list[ResumeSection] = Field(default_factory=list, description="结构化简历区块")
    template: str = Field(default="classic", description="预览模板 key")
    theme: str = Field(default="#2563eb", description="主题色 hex")
