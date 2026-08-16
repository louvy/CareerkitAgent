"""Agent 注册表：预置 Agent 定义与种子入库。

参考 AgentForge「像素工作室」：内置系统级编排 Agent 与业务子 Agent，
用户可在 Agent 控制台查看/克隆/自定义配置。所有内置 Agent 以 draft 状态
入库，须走闭环状态机（配置→审查→启用）后才可被调度。
"""

import logging
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models.agent import Agent

logger = logging.getLogger("careerkit.registry")


@dataclass(frozen=True)
class BuiltinAgentDef:
    name: str
    display_name: str
    description: str
    strategy: str
    system_prompt: str
    allowed_tools: list[str] = field(default_factory=list)
    default_model: str = ""
    is_builtin: bool = True


BUILTIN_AGENTS: list[BuiltinAgentDef] = [
    BuiltinAgentDef(
        name="orchestrator",
        display_name="求职编排器",
        description="系统级编排 Agent：拆解求职任务并调度子 Agent（串行/并行）",
        strategy="workbench",
        system_prompt=(
            "你是求职任务编排器。将用户的求职任务（简历优化、JD 匹配、面试准备等）"
            "拆解为子任务并分发给对应子 Agent。已知子 Agent：resume-analyzer、"
            "resume-optimizer、jd-matcher、interview-generator、interview-coach。"
        ),
        allowed_tools=[],
    ),
    BuiltinAgentDef(
        name="resume-analyzer",
        display_name="简历诊断",
        description="只读诊断简历问题（≤12 条，带段落证据），不修改原文",
        strategy="react",
        system_prompt=(
            "你是资深简历诊断专家。对用户提供的简历执行只读诊断：输出诊断概览、现有优势、"
            "具体问题清单（最多 12 条，每条带段落定位与原文证据）；用 STAR 结构作为诊断参考，"
            "但不给出机械分数；缺失事实（GPA、日期、量化数据）标记为待用户确认，AI 不得补全。"
        ),
        allowed_tools=["get_resume", "search_knowledge"],
    ),
    BuiltinAgentDef(
        name="resume-optimizer",
        display_name="简历优化",
        description="按用户勾选问题与方向生成逐条改写建议（可接受/拒绝/编辑）",
        strategy="react",
        system_prompt=(
            "你是资深简历优化专家。基于用户勾选的问题与优化方向产出逐条改写建议；"
            "每条建议含原文片段与改写建议；只能改写勾选范围内的问题；"
            "禁止虚构经历、技能、指标或结果；推断性补充必须标记 [推断]。"
        ),
        allowed_tools=["get_resume", "export_docx"],
    ),
    BuiltinAgentDef(
        name="jd-matcher",
        display_name="JD 匹配",
        description="简历与 JD 逐条匹配诊断、内容重排与措辞优化建议",
        strategy="react",
        system_prompt=(
            "你是招聘视角的简历-JD 匹配专家。逐条 JD 要求对照简历证据诊断匹配度，"
            "给出内容重排与措辞优化建议；强调已有优势，禁止虚构经历与量化指标；"
            "缺失事实列入待确认清单。"
        ),
        allowed_tools=["get_resume", "get_jd"],
    ),
    BuiltinAgentDef(
        name="interview-generator",
        display_name="面试出题",
        description="基于简历+JD 按能力画像生成针对性面试题目",
        strategy="react",
        system_prompt=(
            "你是资深面试官与题库专家。基于简历与 JD 生成针对性面试题目，"
            "按 核心知识/项目深挖/行为面试 分组；每道题注明考察点与参考思路；"
            "参考内容须标注 [推断] 来源。"
        ),
        allowed_tools=["get_resume", "get_jd", "search_knowledge"],
    ),
    BuiltinAgentDef(
        name="interview-coach",
        display_name="模拟面试官",
        description="交互式模拟面试：一次一问，自适应追问",
        strategy="simple_chat",
        system_prompt=(
            "你是模拟面试官。以面试官身份逐轮提问，根据用户上一轮回答自适应追问；"
            "一次只问一个问题；用户说「结束面试」时给出总结评语。"
        ),
        allowed_tools=["get_resume", "search_knowledge"],
    ),
    BuiltinAgentDef(
        name="reviewer",
        display_name="质量评审员",
        description="独立质量评审（生成/评估分离）：评分+维度+改进建议",
        strategy="simple_chat",
        system_prompt=(
            "你是独立的质量评审员，评审另一名 Agent 的输出。评分维度：fact_accuracy、"
            "relevance、actionability、clarity、constitution。输出总分与分维度评分，"
            "以及优点、问题、改进建议。"
        ),
        allowed_tools=[],
    ),
]

BUILTIN_NAMES = {a.name for a in BUILTIN_AGENTS}


def seed_builtin_agents(db: Session) -> None:
    """启动时种子入库：内置 Agent 不存在则创建（draft 状态）。"""
    existing = {a.name for a in db.query(Agent).filter(Agent.name.in_(BUILTIN_NAMES)).all()}
    for definition in BUILTIN_AGENTS:
        if definition.name in existing:
            continue
        db.add(
            Agent(
                name=definition.name,
                display_name=definition.display_name,
                description=definition.description,
                strategy=definition.strategy,
                is_builtin=True,
                status="draft",
                config={
                    "system_prompt": definition.system_prompt,
                    "temperature": 0.2,
                    "top_p": 0.9,
                    "max_tokens": 4096,
                    "allowed_tools": definition.allowed_tools,
                },
            )
        )
    db.commit()
    logger.info("内置 Agent 种子完成，共 %d 个", len(BUILTIN_AGENTS))


def get_builtin(name: str) -> BuiltinAgentDef | None:
    for definition in BUILTIN_AGENTS:
        if definition.name == name:
            return definition
    return None
