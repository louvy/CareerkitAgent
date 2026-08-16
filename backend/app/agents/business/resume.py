"""简历业务 Agent 处理器：诊断与优化（参考 Lujie 事实边界原则）。"""

import json

from app.harness.constitution import constitution_text
from app.harness.hooks import RunContext
from app.harness.tool_guard import ToolGuard
from app.schemas.resume import OptimizationSuggestions, ResumeDiagnosis
from app.services.llm import chat_json

# 业务提示词（注入宪法后使用）
DIAGNOSIS_SYSTEM_PROMPT = (
    "你是资深简历诊断专家。对用户提供的简历执行只读诊断：\n"
    "1. 输出诊断概览、现有优势、具体问题清单（最多 12 条，按 优先处理/推荐/可选 分组，每条必须带段落定位与原文证据）；\n"
    "2. 用 STAR 结构作为诊断参考，检查 动作-方法-结果 是否清晰，但不给出机械分数；\n"
    "3. 缺失事实（GPA、日期、量化数据）标记到 missing_facts，交由用户确认补录，AI 不得补全。\n"
    "只诊断，不修改简历内容。"
)

OPTIMIZE_SYSTEM_PROMPT = (
    "你是资深简历优化专家。基于用户勾选的问题与优化方向，产出逐条改写建议：\n"
    "1. 每条建议必须包含 原文片段 与 改写建议，供用户逐条接受/拒绝/编辑；\n"
    "2. 只能改写用户勾选范围内的问题，不得扩大范围；\n"
    "3. 禁止虚构经历、技能、指标或结果；推断性补充必须标记 is_inference=true；\n"
    "4. 缺失事实只能放入 notes 提醒用户补充。"
)

_DIRECTIONS_TEXT = {
    "clarity": "提升表述清晰度",
    "impact": "强化成果与影响力",
    "concision": "精简冗余表述",
    "ats": "提升 ATS 可读性（关键词、格式）",
}


def run_diagnosis(version_id: int, ctx: RunContext, guard: ToolGuard) -> ResumeDiagnosis:
    """简历诊断：只读快照 + 结构化输出。"""
    resume_text = guard.invoke("get_resume", version_id=version_id)
    system = constitution_text() + "\n\n" + DIAGNOSIS_SYSTEM_PROMPT
    user = f"请诊断以下简历：\n\n{resume_text}"
    result = chat_json(system, user, ResumeDiagnosis, ctx=ctx)
    ctx.trace.final_output = json.dumps(result.model_dump(), ensure_ascii=False)
    return result


def run_optimize(
    version_id: int,
    selected_issues: list[dict],
    directions: list[str],
    extra_instruction: str,
    ctx: RunContext,
    guard: ToolGuard,
) -> OptimizationSuggestions:
    """简历优化：仅处理用户勾选的问题，产出逐条建议。"""
    resume_text = guard.invoke("get_resume", version_id=version_id)
    direction_text = "；".join(_DIRECTIONS_TEXT.get(d, d) for d in directions) or "整体优化"
    system = constitution_text() + "\n\n" + OPTIMIZE_SYSTEM_PROMPT
    user = (
        f"简历原文：\n{resume_text}\n\n"
        f"用户选择的优化方向：{direction_text}\n"
        f"用户勾选待处理的问题：\n{json.dumps(selected_issues, ensure_ascii=False)}\n"
        f"额外要求：{extra_instruction or '无'}\n\n"
        "请产出逐条改写建议。"
    )
    result = chat_json(system, user, OptimizationSuggestions, ctx=ctx)
    ctx.trace.final_output = json.dumps(result.model_dump(), ensure_ascii=False)
    return result
