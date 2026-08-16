"""LLM 服务：OpenAI 兼容客户端封装。

- 从 AppSetting 读取供应商配置（加密存储），未配置时回退默认值
- 支持结构化输出（JSON + Pydantic 校验，失败重试）
- Token 统计回写 RunContext（可观测性）
- 滑动窗口限流（超限返回 429）+ 结构化输出校验反馈重试
"""

import json
import logging
import time
import uuid
from typing import Any, TypeVar

from openai import OpenAI
from pydantic import BaseModel, ValidationError

from app.core.deps import redis_client
from app.core.exceptions import LLMNotConfiguredError, RateLimitError
from app.harness.hooks import RunContext
from app.services.crypto import decrypt_value
from app.services.settings_store import get_setting

logger = logging.getLogger("careerkit.llm")

T = TypeVar("T", bound=BaseModel)

# 设置键
SETTING_BASE_URL = "llm.base_url"
SETTING_API_KEY = "llm.api_key"
SETTING_MODEL = "llm.model"
SETTING_EMBEDDING_MODEL = "llm.embedding_model"

# 限流：每分钟最多 LLM 调用次数
RATE_LIMIT_PER_MINUTE = 30

# 供应商解析结果缓存（减少每次 LLM 调用新开 DB 会话）；TTL 内允许密钥变更最终生效
_provider_cache: dict[str, tuple[float, tuple[str, str, str]]] = {}
_PROVIDER_TTL = 30.0


def _resolve_chat_provider(model_override: str | None = None) -> tuple[str, str, str]:
    """解析 chat 供应商配置，返回 (base_url, api_key, model)。

    优先模型管理（LLMModel）：按 model 名匹配 → 分类默认模型；
    无模型条目时回退 AppSetting 旧配置，最后用默认值。
    结果缓存 _PROVIDER_TTL 秒，避免每次 LLM 调用都新开 DB 会话。
    """
    cache_key = model_override or ""
    now = time.time()
    cached = _provider_cache.get(cache_key)
    if cached is not None and now - cached[0] < _PROVIDER_TTL:
        return cached[1]

    from app.models.llm_model import LLMModel

    from app.core.deps import SessionLocal

    with SessionLocal() as db:
        matched = None
        if model_override:
            matched = (
                db.query(LLMModel)
                .filter(LLMModel.category == "chat", LLMModel.model == model_override)
                .first()
            )
        if matched is None:
            matched = (
                db.query(LLMModel)
                .filter(LLMModel.category == "chat", LLMModel.is_default.is_(True))
                .first()
            )
        if matched is not None and matched.api_key:
            result = (matched.base_url, decrypt_value(matched.api_key), matched.model)
            _provider_cache[cache_key] = (now, result)
            return result
    # 回退旧设置
    base_url = get_setting(SETTING_BASE_URL) or ""
    api_key = decrypt_value(get_setting(SETTING_API_KEY)) if get_setting(SETTING_API_KEY) else ""
    model = get_setting(SETTING_MODEL) or ""
    result = (base_url, api_key, model)
    _provider_cache[cache_key] = (now, result)
    return result


def _model_for_ctx(ctx: RunContext | None) -> str | None:
    """从 RunContext 取 Agent 配置的模型名。"""
    return getattr(ctx, "model", None) or None


def build_client(model_override: str | None = None) -> tuple[OpenAI, str]:
    """构造 OpenAI 兼容客户端，返回 (client, 最终解析的模型名)。

    model_override 仅用于匹配模型管理条目；实际请求必须使用解析出的
    模型名（如 Agent 旧配置的 gpt-4o-mini 会落到默认 chat 模型）。
    """
    base_url, api_key, resolved_model = _resolve_chat_provider(model_override)
    if not api_key:
        raise LLMNotConfiguredError()
    kwargs: dict[str, Any] = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs), resolved_model


def _check_rate_limit() -> None:
    """滑动窗口限流：最近 60s 内 LLM 调用不超过 RATE_LIMIT_PER_MINUTE 次。

    超限抛出 RateLimitError（HTTP 429），不再误用 PermissionError 导致 500。
    """
    key = "careerkit:llm:rate"
    now = time.time()
    window = 60.0
    # 清理窗口外的旧时间戳
    redis_client.zremrangebyscore(key, 0, now - window)
    if redis_client.zcard(key) >= RATE_LIMIT_PER_MINUTE:
        raise RateLimitError()
    # 用唯一成员记录本次调用时间戳
    redis_client.zadd(key, {f"{now}:{uuid.uuid4().hex}": now})
    redis_client.expire(key, int(window))


def chat_json(
    system: str, user: str, response_model: type[T], ctx: RunContext | None = None, model: str | None = None
) -> T:
    """调用 LLM 并要求 JSON 结构化输出，按 response_model 校验；校验失败反馈修正后重试。"""
    _check_rate_limit()
    model_hint = model or _model_for_ctx(ctx)
    client, resolved_model = build_client(model_hint)
    schema_hint = _schema_hint(response_model)
    last_exc: Exception | None = None
    for attempt in range(3):
        prompt = f"{user}\n\n{schema_hint}"
        if last_exc is not None:
            prompt += f"\n\n上次输出校验失败：{str(last_exc)[:200]}，请严格按字段名修正后重新输出完整 JSON。"
        if ctx:
            ctx.trace.record_prompt(system, prompt, model=resolved_model)
        try:
            resp = client.chat.completions.create(
                model=resolved_model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
        except Exception:
            if attempt < 2:
                time.sleep(2**attempt)
                continue
            raise
        content = resp.choices[0].message.content or "{}"
        usage = resp.usage
        if ctx and usage:
            ctx.add_llm(usage.prompt_tokens or 0, usage.completion_tokens or 0, resolved_model)
        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            last_exc = ValueError(f"LLM 返回非法 JSON: {content[:200]}")
            logger.warning("LLM 返回非法 JSON（第 %d 次）: %s", attempt + 1, content[:200])
            if attempt < 2:
                time.sleep(2**attempt)
                continue
            raise last_exc from exc
        try:
            return response_model.model_validate(data)
        except ValidationError as exc:
            last_exc = exc
            logger.warning("LLM 结构化输出校验失败（第 %d 次）: %s", attempt + 1, exc.errors()[:3])
            time.sleep(2**attempt)
    raise last_exc  # type: ignore[misc]


def _schema_hint(model: type[BaseModel]) -> str:
    """将 Pydantic 模型转为 LLM 可读的字段说明。

    不注入完整 JSON Schema：部分模型（如 GLM-4.7-flash）会把 schema 的
    description/properties 外壳误当输出模板回显，导致字段名错位。
    """

    def describe(ann: Any, depth: int = 0) -> str:
        origin = getattr(ann, "__origin__", None)
        args = getattr(ann, "__args__", ())
        if origin is list and args:
            inner = args[0]
            if isinstance(inner, type) and issubclass(inner, BaseModel):
                parts = [f"{n}({describe(f.annotation, depth + 1)})" for n, f in inner.model_fields.items()]
                return "对象数组，每项字段：" + "、".join(parts)
            return getattr(inner, "__name__", str(inner)) + " 数组"
        if origin is dict:
            return "对象"
        if origin is not None:  # Optional[T] / Union
            non_none = [a for a in args if a is not type(None)]
            if non_none:
                return describe(non_none[0], depth)
        if isinstance(ann, type) and issubclass(ann, BaseModel):
            return "对象，字段：" + "、".join(ann.model_fields)
        return getattr(ann, "__name__", str(ann))

    lines = ["请输出一个 JSON 对象，只包含以下字段："]
    for name, field in model.model_fields.items():
        required = "必填" if field.is_required() else "可选"
        desc = field.description or ""
        lines.append(f"- {name}：{describe(field.annotation)}（{required}）{desc}")
    return "\n".join(lines)


def chat_text(system: str, user: str, ctx: RunContext | None = None, model: str | None = None) -> str:
    """非结构化文本调用（评审等场景）。"""
    _check_rate_limit()
    model_hint = model or _model_for_ctx(ctx)
    client, resolved_model = build_client(model_hint)
    if ctx:
        ctx.trace.record_prompt(system, user, model=resolved_model)
    resp = client.chat.completions.create(
        model=resolved_model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.3,
    )
    usage = resp.usage
    if ctx and usage:
        ctx.add_llm(usage.prompt_tokens or 0, usage.completion_tokens or 0, resolved_model)
    return resp.choices[0].message.content or ""


def get_embedding_model() -> str:
    """当前默认 embedding 模型名（模型管理 → 旧设置 → 配置默认值）。"""
    from app.config import settings

    return get_setting(SETTING_EMBEDDING_MODEL) or settings.embedding_model
