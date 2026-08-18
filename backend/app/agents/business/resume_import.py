"""简历导入 Agent 处理器：将原始简历文本重组为结构化 JSON（不虚构）。"""

from app.harness.constitution import constitution_text
from app.schemas.resume_import import ResumeContent
from app.services.llm import chat_json

IMPORT_SYSTEM_PROMPT = (
    "你是简历解析专家。将用户提供的原始简历文本重组为结构化 JSON。\n"
    "要求：\n"
    "1. 仅重组简历中**已有**的信息，按区块（基本信息 / 教育经历 / 工作经历 / 项目经历 / 技能 / 其他）归类；\n"
    "2. 绝对禁止虚构、推断或补全任何原文不存在的事实（经历、量化指标、奖项、日期、GPA 等）；"
    "缺失项直接留空或省略，不要编造；\n"
    "3. 每个区块的 items 为该区块下的要点文本列表（字符串数组）；\n"
    "4. 不输出任何解释，只输出结构化结果。"
)


def run_import(text: str) -> ResumeContent:
    """将原始简历文本经 LLM 抽取为结构化简历内容。"""
    system = constitution_text() + "\n\n" + IMPORT_SYSTEM_PROMPT
    user = f"请解析以下简历原文并输出结构化结果：\n\n{text}"
    return chat_json(system, user, ResumeContent)
