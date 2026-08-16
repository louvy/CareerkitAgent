"""系统工具注册表：Agent 可挂载的工具实现。

每个工具签名统一为 fn(**kwargs)，通过 harness.tool_guard.ToolGuard 校验后调用；
参数与结果由调用方写入 Trace（可观测性）。
"""

import logging

from app.core.deps import SessionLocal
from app.harness.tool_guard import register_tool
from app.models.jd import JD
from app.models.resume import ResumeVersion
from app.services.retriever import hybrid_search
from app.services.embedding import embed_text

logger = logging.getLogger("careerkit.tools")


@register_tool
def get_resume(version_id: int | None = None, **_) -> str:
    """读取简历版本内容（扁平化文本）。"""
    if not version_id:
        return "未指定简历版本"
    with SessionLocal() as db:
        version = db.get(ResumeVersion, version_id)
        if not version:
            return f"简历版本 {version_id} 不存在"
        return version.plain_text


@register_tool
def get_jd(jd_id: int | None = None, **_) -> str:
    """读取 JD 内容。"""
    if not jd_id:
        return "未指定 JD"
    with SessionLocal() as db:
        jd = db.get(JD, jd_id)
        if not jd:
            return f"JD {jd_id} 不存在"
        return f"公司: {jd.company}\n职位: {jd.title}\n描述:\n{jd.content}"


@register_tool
def search_knowledge(query: str = "", kb_ids: list[int] | None = None, **_) -> str:
    """知识库混合检索（关键词+向量+RRF）。返回带来源标注的文本。"""
    if not query:
        return "检索词为空"
    with SessionLocal() as db:
        embedding = embed_text(query)
        results = hybrid_search(db, query, embedding if embedding else None, kb_ids=kb_ids, top_k=5)
    if not results:
        return "知识库无匹配内容"
    lines = []
    for r in results:
        lines.append(f"[来源:{r['source_file']} #{r['metadata'].get('chunk_index', '')}]\n{r['content'][:600]}")
    return "\n\n".join(lines)


@register_tool
def export_docx(version_id: int | None = None, **_) -> str:
    """将简历版本导出为 Word 并存入 MinIO，返回对象名。"""
    if not version_id:
        return "未指定简历版本"
    from app.models.resume import ResumeVersion
    from app.services.export import resume_to_docx_bytes
    from app.services.storage import upload_bytes

    with SessionLocal() as db:
        version = db.get(ResumeVersion, version_id)
        if not version:
            return f"简历版本 {version_id} 不存在"
        label = version.label or f"resume-{version_id}"
        data = resume_to_docx_bytes(version)
    obj = upload_bytes("exports", f"{label}.docx", data, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return f"导出成功，文件: {obj}"


def init_tools() -> None:
    """确保工具已注册（import 即注册，此函数仅作显式初始化入口）。"""
    logger.debug("工具注册完成: %s", list(__import__("app.harness.tool_guard", fromlist=["list_registered_tools"]).list_registered_tools()))
