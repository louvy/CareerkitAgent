"""JD 匹配业务 Agent 处理器：证据差距诊断 + 重排/措辞建议。"""

import json

from app.harness.constitution import constitution_text
from app.harness.hooks import RunContext
from app.harness.tool_guard import ToolGuard
from app.schemas.jd import JDMatchResult
from app.services.llm import chat_json

MATCH_SYSTEM_PROMPT = (
    "你是招聘视角的简历-JD 匹配专家。对给定 JD 与简历：\n"
    "1. 逐条 JD 要求对照简历证据诊断匹配度（0-10），无直接证据必须明示；\n"
    "2. 给出内容重排建议（按 JD 关键词优先级调整简历段落顺序）与措辞优化建议；\n"
    "3. 强调已有优势，但禁止虚构经历、技能或量化指标；缺失事实列入 missing_facts 由用户确认。"
)


def run_jd_match(version_id: int, jd_id: int, ctx: RunContext, guard: ToolGuard) -> JDMatchResult:
    resume_text = guard.invoke("get_resume", version_id=version_id)
    jd_text = guard.invoke("get_jd", jd_id=jd_id)
    system = constitution_text() + "\n\n" + MATCH_SYSTEM_PROMPT
    user = f"职位描述：\n{jd_text}\n\n简历内容：\n{resume_text}"
    result = chat_json(system, user, JDMatchResult, ctx=ctx)
    ctx.trace.final_output = json.dumps(result.model_dump(), ensure_ascii=False)
    return result
