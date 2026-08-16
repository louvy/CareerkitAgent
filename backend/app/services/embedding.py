"""Embedding 服务：OpenAI 兼容接口，向量缓存到 Redis。

支持按知识库配置的 embedding 模型（LLMModel）解析供应商，
未指定时使用全局默认 embedding 模型。
"""

import hashlib
import json
import logging

from app.core.deps import redis_client
from app.services.crypto import decrypt_value
from app.services.llm import get_embedding_model
from app.services.settings_store import get_setting

logger = logging.getLogger("careerkit.embedding")

EMBED_CACHE_TTL = 86400 * 7


def _resolve_embedding_provider(embedding_model_id: int | None = None) -> tuple[str, str, str]:
    """解析 embedding 供应商，返回 (base_url, api_key, model)。

    优先模型管理（LLMModel）：按 ID 匹配 → 分类默认模型；
    无模型条目时回退 AppSetting 旧配置与配置默认值。
    """
    from app.core.deps import SessionLocal
    from app.models.llm_model import LLMModel

    with SessionLocal() as db:
        matched = None
        if embedding_model_id:
            matched = db.get(LLMModel, embedding_model_id)
        if matched is None:
            matched = (
                db.query(LLMModel)
                .filter(LLMModel.category == "embedding", LLMModel.is_default.is_(True))
                .first()
            )
        if matched is not None and matched.api_key:
            return matched.base_url, decrypt_value(matched.api_key), matched.model
    # 回退旧设置
    from app.services.llm import SETTING_API_KEY, SETTING_BASE_URL

    base_url = get_setting(SETTING_BASE_URL) or ""
    api_key = decrypt_value(get_setting(SETTING_API_KEY)) if get_setting(SETTING_API_KEY) else ""
    return base_url, api_key, get_embedding_model()


def embed_texts(texts: list[str], embedding_model_id: int | None = None) -> list[list[float]]:
    """批量向量化。先查 Redis 缓存，未命中再调 API。

    embedding_model_id 指定知识库绑定的 embedding 模型；为空用全局默认。
    """
    base_url, api_key, model = _resolve_embedding_provider(embedding_model_id)
    if not api_key:
        return [[] for _ in texts]

    results: list[list[float]] = []
    missing: list[tuple[int, str]] = []
    for idx, text in enumerate(texts):
        digest = hashlib.md5(f"{model}:{text}".encode("utf-8")).hexdigest()
        cache_key = f"careerkit:emb:{digest}"
        cached = redis_client.get(cache_key)
        if cached:
            results.append(json.loads(cached))
        else:
            results.append([])
            missing.append((idx, text))

    if missing:
        from openai import OpenAI

        kwargs: dict = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        client = OpenAI(**kwargs)
        batch = [text for _, text in missing]
        resp = client.embeddings.create(model=model, input=batch)
        for (idx, text), item in zip(missing, resp.data, strict=False):
            vector = item.embedding
            results[idx] = vector
            digest = hashlib.md5(f"{model}:{text}".encode("utf-8")).hexdigest()
            redis_client.setex(f"careerkit:emb:{digest}", EMBED_CACHE_TTL, json.dumps(vector))
    return results


def embed_text(text: str, embedding_model_id: int | None = None) -> list[float]:
    vectors = embed_texts([text], embedding_model_id=embedding_model_id)
    return vectors[0] if vectors else []
