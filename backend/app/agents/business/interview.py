"""面试刷题业务 Agent 处理器：出题、复盘、模拟面试教练。"""

import json

from app.harness.constitution import constitution_text
from app.harness.hooks import RunContext
from app.harness.tool_guard import ToolGuard
from app.schemas.interview import InterviewQuestionSet, InterviewReviewReport
from app.services.llm import chat_json, chat_text

GENERATOR_SYSTEM_PROMPT = (
    "你是资深面试官与题库专家。基于简历与 JD 生成针对性面试题目：\n"
    "1. 题目按能力画像分组：核心知识 / 项目深挖 / 行为面试；\n"
    "2. 每道题注明考察点与参考思路要点（AI 生成的参考内容须标注 [推断]）；\n"
    "3. 题目必须紧扣简历经历与 JD 要求，不脱离实际。"
)

REVIEW_SYSTEM_PROMPT = (
    "你是面试复盘评审专家。对用户的面试作答进行逐题评估：\n"
    "1. 每题给出得分（0-10）、优点、不足、改进方向与参考要点；\n"
    "2. 评估须基于作答内容本身，客观指出结构（如 STAR）与深度问题；\n"
    "3. 参考要点标注来源（简历/JD/[推断]）。"
)

COACH_SYSTEM_PROMPT = (
    "你是模拟面试官。遵循以下规则：\n"
    "1. 以面试官身份逐轮提问，根据用户上一轮回答进行自适应追问；\n"
    "2. 一次只问一个问题，追问要有深度（STAR 深挖）；\n"
    "3. 会话结束信号由调用方控制（用户说「结束面试」时给出总结评语）。"
)


def run_generate_questions(
    version_id: int, jd_id: int | None, ctx: RunContext, guard: ToolGuard
) -> InterviewQuestionSet:
    resume_text = guard.invoke("get_resume", version_id=version_id)
    jd_text = guard.invoke("get_jd", jd_id=jd_id) if jd_id else "（未绑定 JD，按简历通用出题）"
    system = constitution_text() + "\n\n" + GENERATOR_SYSTEM_PROMPT
    user = f"职位描述：\n{jd_text}\n\n简历内容：\n{resume_text}"
    result = chat_json(system, user, InterviewQuestionSet, ctx=ctx)
    ctx.trace.final_output = json.dumps(result.model_dump(), ensure_ascii=False)
    return result


def run_review_answers(
    qa_pairs: list[dict], resume_text: str, ctx: RunContext, guard: ToolGuard
) -> InterviewReviewReport:
    """逐题复盘：qa_pairs = [{question, answer}]。"""
    system = constitution_text() + "\n\n" + REVIEW_SYSTEM_PROMPT
    user = (
        f"简历内容（背景参考）：\n{resume_text}\n\n"
        f"题目与作答：\n{json.dumps(qa_pairs, ensure_ascii=False)}\n\n请逐题复盘。"
    )
    result = chat_json(system, user, InterviewReviewReport, ctx=ctx)
    ctx.trace.final_output = json.dumps(result.model_dump(), ensure_ascii=False)
    return result


def run_coach_turn(
    messages: list[dict], resume_text: str, ctx: RunContext, guard: ToolGuard
) -> str:
    """模拟面试对话轮：messages 为历史（含最新用户回答）。"""
    system = constitution_text() + "\n\n" + COACH_SYSTEM_PROMPT + "\n\n候选人简历背景：\n" + resume_text[:3000]
    conversation = "\n".join(f"{m['role']}: {m['content']}" for m in messages)
    reply = chat_text(system, f"以下是面试对话历史，请给出你的下一轮回应：\n{conversation}", ctx=ctx)
    ctx.trace.final_output = reply
    return reply
