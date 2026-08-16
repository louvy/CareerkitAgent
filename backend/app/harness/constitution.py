"""全局宪法（Constitution）：注入每个 Agent 的硬性行为约束。

参考 AgentForge 的 Harness 编程模式与 Lujie-Careerkit 的事实边界原则。
宪法条款在三个层面生效：
1. 注入 System Prompt（作为行为指引）
2. 输出后校验（validate_output，违反即触发重试或降级）
3. 审计记录（违反事件入 audit_logs）
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ConstitutionRule:
    id: str
    text: str
    # 校验维度：output_text / facts
    check: str = "output_text"
    enabled: bool = True


CONSTITUTION_RULES: list[ConstitutionRule] = [
    ConstitutionRule(
        id="FACT_NO_FABRICATION",
        text="禁止虚构、推断或补全用户简历中不存在的事实（经历、技能、量化指标、奖项、GPA、日期等）。"
        "缺少证据的内容只能标记为待确认，不得由 AI 补全。",
    ),
    ConstitutionRule(
        id="FACT_SOURCE_LABEL",
        text="回答中知识库/简历引用内容与 AI 推断内容必须分开标注；推断内容前缀标 [推断]。",
    ),
    ConstitutionRule(
        id="CHANGE_USER_CONFIRM",
        text="AI 对简历的任何修改必须先产出逐条建议供用户确认，用户接受后才能写入新版本；"
        "不得直接改写原简历。",
    ),
    ConstitutionRule(
        id="DIAGNOSIS_EVIDENCE",
        text="诊断问题必须附带简历段落定位与原文证据，无证据的问题不得超过问题总数的 30%。",
    ),
    ConstitutionRule(
        id="DIAGNOSIS_LIMIT",
        text="单次简历诊断问题数量不得超过 12 条，并按 优先处理/推荐/可选 三档分组。",
    ),
    ConstitutionRule(
        id="NO_SELF_REVIEW",
        text="业务 Agent 不得评审自己的输出；评审必须由独立上下文的评审 Agent 执行（生成/评估分离）。",
    ),
    ConstitutionRule(
        id="OUTPUT_LANGUAGE",
        text="面向用户的所有输出使用简体中文；专业术语可保留英文原词。",
    ),
]

# 宪法全文：注入 System Prompt 的段落
CONSTITUTION_PREAMBLE = (
    "## 全局宪法（不可违反）\n"
    "以下条款对所有输出具有最高约束力，任何情况下不得违反：\n"
)


def constitution_text(extra_rules: list[str] | None = None) -> str:
    """组装宪法提示词段落，可附加 Agent 专属条款。"""
    lines = [CONSTITUTION_PREAMBLE]
    for rule in CONSTITUTION_RULES:
        if rule.enabled:
            lines.append(f"- [{rule.id}] {rule.text}")
    for extra in extra_rules or []:
        lines.append(f"- [EXTRA] {extra}")
    return "\n".join(lines)


# 虚构事实检测标记：LLM 输出中出现这些词且无简历依据时视为疑似虚构
FABRICATION_MARKERS = ("荣获", "获得第一名", "增长 300%", "提升 50%", "排名前 1%")


@dataclass
class ConstitutionViolation:
    rule_id: str
    message: str
    severity: str = "warning"  # warning / error


def validate_output(text: str, *, source_text: str = "", facts: list[str] | None = None) -> list[ConstitutionViolation]:
    """对 Agent 输出执行宪法校验。返回违规列表；空列表表示通过。

    - FACT_NO_FABRICATION：输出含疑似虚构标记时检查对应事实是否出现在简历原文中
    - FACT_SOURCE_LABEL：含 [推断] 以外的推断性内容无法自动判定，由评审 Agent 复核
    """
    violations: list[ConstitutionViolation] = []
    if not text:
        return violations

    for marker in FABRICATION_MARKERS:
        if marker in text and marker not in source_text:
            violations.append(
                ConstitutionViolation(
                    rule_id="FACT_NO_FABRICATION",
                    message=f"检测到疑似虚构表述「{marker}」，该表述在源材料中不存在证据。",
                    severity="error",
                )
            )

    for fact in facts or []:
        if fact and fact in text and fact not in source_text:
            violations.append(
                ConstitutionViolation(
                    rule_id="FACT_NO_FABRICATION",
                    message=f"输出包含源材料中不存在的事实「{fact[:50]}」。",
                    severity="error",
                )
            )
    return violations


def has_blocking_violation(violations: list[ConstitutionViolation]) -> bool:
    return any(v.severity == "error" for v in violations)


@dataclass
class ConstitutionContext:
    """一次校验的上下文快照，供审计使用。"""

    agent_name: str
    run_id: str | None
    violations: list[ConstitutionViolation] = field(default_factory=list)
