"""文档文本抽取：按文件类型分派（pdf / docx / txt / md）。

pdf 借助 pymupdf（fitz），docx 借助 python-docx（已在依赖中）。
依赖在函数内惰性导入，避免未安装时拖累模块加载。
"""

import io
import ipaddress
import re
import socket
import urllib.parse


def extract_text(data: bytes, filename: str = "") -> str:
    """从上传字节中抽取纯文本；按扩展名分派解析器，未知类型按 UTF-8 解码。"""
    lower = (filename or "").lower()
    if lower.endswith(".pdf"):
        return _extract_pdf(data)
    if lower.endswith(".docx"):
        return _extract_docx(data)
    # txt / md / 其他：按 UTF-8 解码（忽略非法字节）
    return data.decode("utf-8", errors="ignore")


# ---------- 网页抓取（含 SSRF 防护） ----------

_ALLOWED_SCHEMES = {"http", "https"}


def _is_private_host(hostname: str) -> bool:
    """解析主机到 IP（可能多个），任一为私有/保留/回环/链路本地即视为不可信。"""
    try:
        infos = socket.getaddrinfo(hostname, None)
    except Exception:
        return True  # 解析失败按不可信处理
    for info in infos:
        ip = info[4][0].split("%")[0]
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return True
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast:
            return True
    return False


def fetch_url_text(url: str) -> str:
    """抓取网页正文并抽取纯文本。

    安全：仅允许 http/https，且目标主机解析后不得为内网/保留/回环地址（SSRF 防护）。
    不跟随重定向，避免重定向绕过主机校验。
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise ValueError("仅支持 http/https 链接")
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("无效的 URL")
    if _is_private_host(hostname):
        raise ValueError("拒绝访问内网/保留地址（SSRF 防护）")

    import httpx

    try:
        resp = httpx.get(
            url,
            timeout=15.0,
            follow_redirects=False,
            headers={"User-Agent": "CareerKitAgent/1.0"},
        )
    except Exception as exc:  # 网络/超时等
        raise ValueError(f"抓取网页失败: {exc}") from exc
    if resp.status_code != 200:
        raise ValueError(f"网页返回状态码 {resp.status_code}")

    # 重定向目标也需合规（此处已关闭重定向，浏览器侧会 3xx，不自动跟随）
    redirect_loc = resp.headers.get("location")
    if redirect_loc:
        r = urllib.parse.urlparse(redirect_loc)
        rh = r.hostname or hostname
        if r.scheme not in _ALLOWED_SCHEMES or _is_private_host(rh):
            raise ValueError("重定向目标不合规（SSRF 防护）")

    return _html_to_text(resp.text, url)


def _html_to_text(html: str, url: str = "") -> str:
    """优先用 trafilatura 抽取正文；不可用时回退到去标签 + 压缩空白。"""
    try:
        import trafilatura

        extracted = trafilatura.extract(html, url=url)
        if extracted and extracted.strip():
            return extracted
    except Exception:
        pass
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


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
