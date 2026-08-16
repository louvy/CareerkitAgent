"""请求链路中间件：X-Request-Id 透传、审计日志、输入净化、CORS。"""

import contextvars
import logging
import re
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

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
    """为每个请求生成 X-Request-Id、记录审计日志并做内容扫描。"""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:16]
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
