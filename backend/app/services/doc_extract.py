"""文档文本抽取：按文件类型分派（pdf / docx / txt / md）。

pdf 借助 pymupdf（fitz），docx 借助 python-docx（已在依赖中）。
依赖在函数内惰性导入，避免未安装时拖累模块加载。
"""

import io


def extract_text(data: bytes, filename: str = "") -> str:
    """从上传字节中抽取纯文本；按扩展名分派解析器，未知类型按 UTF-8 解码。"""
    lower = (filename or "").lower()
    if lower.endswith(".pdf"):
        return _extract_pdf(data)
    if lower.endswith(".docx"):
        return _extract_docx(data)
    # txt / md / 其他：按 UTF-8 解码（忽略非法字节）
    return data.decode("utf-8", errors="ignore")


def _extract_pdf(data: bytes) -> str:
    import fitz  # pymupdf

    doc = fitz.open(stream=data, filetype="pdf")
    try:
        parts = [page.get_text() for page in doc]
    finally:
        doc.close()
    return "\n\n".join(p for p in parts if p.strip())


def _extract_docx(data: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(data))
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(parts)
