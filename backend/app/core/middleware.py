"""请求链路中间件：X-Request-Id 透传、审计日志、入站提示注入扫描、CORS。"""

import contextvars
import logging
import re
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger("careerkit.audit")

# 请求 ID 上下文变量：Agent 层与工具层通过它关联 Trace
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

# 提示注入与敏感信息扫描规则
INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions", re.IGNORECASE),
    re.compile(r"system\s+prompt", re.IGNORECASE),
    re.compile(r"你(现在|接下来|必须).{0,20}(忽略|无视).{0,20}(指令|要求|规则)", re.IGNORECASE),
    re.compile(r"reveal\s+(your|the)\s+(system|prompt|instructions)", re.IGNORECASE),
]

# 敏感字段：日志与 Trace 中脱敏
SENSITIVE_KEYS = {"api_key", "apikey", "secret", "password", "token", "key", "authorization"}

# 入站提示注入拦截开关：默认仅记录不阻断；设为 True 则命中即拒绝（HTTP 400）
BLOCK_INJECTION = False
# 仅扫描 JSON 请求体，且体积不超过此上限（避免大文件/上传被误扫）
_SCAN_MAX_BYTES = 64 * 1024


def redact(value: object) -> object:
    """对敏感字段做脱敏，递归处理 dict / list。"""
    if isinstance(value, dict):
        return {k: "***" if k.lower() in SENSITIVE_KEYS else redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str) and len(value) > 200:
        return value[:200] + "...(truncated)"
    return value


def scan_prompt_injection(text: str) -> list[str]:
    """扫描文本中的提示注入特征，返回命中的规则描述；空列表表示通过。"""
    hits = []
    for pattern in INJECTION_PATTERNS:
        if pattern.search(text):
            hits.append(pattern.pattern)
    return hits


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """为每个请求生成 X-Request-Id、记录审计日志，并对入站 JSON 体做提示注入扫描。"""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:16]

        # 入站提示注入 / PII 扫描：仅 JSON 且体积受限，命中先记录（或按开关拦截）
        if request.method in ("POST", "PUT", "PATCH"):
            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type:
                try:
                    body = await request.body()
                    if body and len(body) <= _SCAN_MAX_BYTES:
                        hits = scan_prompt_injection(body.decode("utf-8", errors="ignore"))
                        if hits:
                            logger.warning(
                                "入站提示注入扫描命中 req=%s path=%s hits=%s",
                                request_id, request.url.path, hits,
                            )
                            if BLOCK_INJECTION:
                                return JSONResponse(
                                    status_code=400,
                                    content={"detail": "检测到疑似提示注入内容，请求已被拦截", "code": "PROMPT_INJECTION"},
                                )
                except Exception:  # 扫描失败不影响主流程
                    pass

        token = request_id_var.set(request_id)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "req=%s method=%s path=%s status=%s ms=%.1f",
            request_id, request.method, request.url.path,
            getattr(response, "status_code", "ERR"), elapsed_ms,
        )
        response.headers["X-Request-Id"] = request_id
        return response
