"""评审 Agent 处理器：生成/评估分离（独立 Persona，禁止自审自评）。"""

import json

from app.harness.constitution import constitution_text
from app.harness.hooks import RunContext
from app.harness.tool_guard import ToolGuard
from app.schemas.agent import ReviewVerdictModel
from app.services.llm import chat_json

REVIEWER_SYSTEM_PROMPT = (
    "你是独立的质量评审员，评审另一名 Agent 的输出。评审标准：\n"
    "1. fact_accuracy（事实准确性）：输出是否虚构/推断源材料中不存在的事实；\n"
    "2. relevance（相关性）：是否紧扣任务与用户输入；\n"
    "3. actionability（可执行性）：建议是否具体、可落地；\n"
    "4. clarity（清晰度）：结构是否清晰、表述是否易读；\n"
    "5. constitution（宪法合规）：是否违反全局宪法条款。\n"
    "输出总分（0-10）与分维度评分，以及优点、问题、改进建议。你与业务 Agent 使用完全独立的上下文。"
)


def run_review(
    output_text: str,
    task_description: str,
    source_text: str,
    ctx: RunContext,
    guard: ToolGuard,
) -> ReviewVerdictModel:
    """评审业务 Agent 的输出。"""
    system = constitution_text() + "\n\n" + REVIEWER_SYSTEM_PROMPT
    user = (
        f"被评审的任务：{task_description}\n\n"
        f"被评审的输出：\n{output_text[:6000]}\n\n"
        f"源材料（用于事实核对）：\n{source_text[:4000]}"
    )
    result = chat_json(system, user, ReviewVerdictModel, ctx=ctx)
    ctx.trace.final_output = json.dumps(result.model_dump(), ensure_ascii=False)
    return result
