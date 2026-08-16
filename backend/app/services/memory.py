"""记忆模块：滑动窗口 + 滚动摘要 + Redis 两级缓存。

参考 AgentForge 记忆架构：
- 滑动窗口：保留最近 N 轮对话原文，超出部分由滚动摘要覆盖
- 滚动摘要：历史 Token 超过阈值时触发增量摘要（异步压缩旧轮次）
- 两级缓存：Redis 缓存已组装的历史轮次（300s TTL），减少重复 DB 查询
- 去重：检测并移除与当前输入重复的最近一轮
"""

import json
import logging

from app.config import settings
from app.core.deps import redis_client
from app.models.conversation import ConversationMessage

logger = logging.getLogger("careerkit.memory")

CACHE_TTL = 300
SUMMARY_KEY_PREFIX = "careerkit:memory:summary:"
HISTORY_KEY_PREFIX = "careerkit:memory:history:"


def _cache_key(conversation_key: str) -> str:
    return f"{HISTORY_KEY_PREFIX}{conversation_key}"


class MemoryService:
    """基于 DB 持久化 + Redis 缓存的会话记忆组装器。"""

    def __init__(self, conversation_key: str, window_rounds: int | None = None):
        self.conversation_key = conversation_key
        self.window_rounds = window_rounds or settings.memory_window_rounds

    def _db_messages(self, db) -> list[ConversationMessage]:
        return (
            db.query(ConversationMessage)
            .filter(ConversationMessage.conversation_key == self.conversation_key)
            .order_by(ConversationMessage.id.asc())
            .all()
        )

    def add_message(self, db, role: str, content: str, meta: dict | None = None) -> None:
        """持久化一条消息并失效缓存。"""
        db.add(ConversationMessage(conversation_key=self.conversation_key, role=role, content=content, meta=meta or {}))
        db.commit()
        redis_client.delete(_cache_key(self.conversation_key))

    def assemble(self, db, current_user_input: str = "") -> list[dict]:
        """组装发给 LLM 的消息序列：[rolling summary] + [recent history] + [current user]。

        Redis 缓存命中时直接返回；未命中则查询 DB 并组装。缓存 key 含用户输入用于去重判断。
        """
        cache_key = _cache_key(self.conversation_key)
        cached = redis_client.get(cache_key)
        if cached:
            history = json.loads(cached)
        else:
            messages = self._db_messages(db)
            history = [{"role": m.role, "content": m.content} for m in messages]
            redis_client.setex(cache_key, CACHE_TTL, json.dumps(history, ensure_ascii=False))

        # 去重：移除与当前输入重复的最近一条
        if current_user_input and history and history[-1].get("content") == current_user_input:
            history = history[:-1]

        return history

    def build_llm_messages(self, db, system_prompt: str, current_user_input: str) -> list[dict]:
        """按 滑动窗口+滚动摘要 组装完整消息序列。"""
        history = self.assemble(db, current_user_input)
        messages: list[dict] = [{"role": "system", "content": system_prompt}]

        # 滚动摘要（旧轮次压缩）
        summary = redis_client.get(f"{SUMMARY_KEY_PREFIX}{self.conversation_key}")
        if summary:
            messages.append({"role": "system", "content": f"## 历史对话摘要\n{summary}"})

        # 滑动窗口：只保留最近 N 轮
        recent = history[-(self.window_rounds * 2) :] if len(history) > self.window_rounds * 2 else history
        messages.extend(recent)

        if current_user_input:
            messages.append({"role": "user", "content": current_user_input})
        return messages

    def maybe_summarize(self, db, history: list[dict]) -> bool:
        """估算历史 Token，超过阈值时生成滚动摘要（增量压缩旧轮次）。

        返回是否触发了摘要。摘要内容仅存 Redis，DB 原文保留供审计。
        """
        total_chars = sum(len(m.get("content", "")) for m in history)
        if total_chars < settings.memory_summary_token_threshold * 2:  # 粗略 2 字符/Token
            return False
        old_part = history[: -settings.memory_window_rounds]
        if not old_part:
            return False
        try:
            from app.services.llm import chat_text

            compact = "\n".join(f"{m['role']}: {m['content'][:500]}" for m in old_part)
            summary = chat_text(
                system="你是会话记忆压缩器。将以下历史对话压缩为不超过 300 字的要点摘要，保留关键事实与用户偏好。",
                user=compact[:12000],
            )
            redis_client.setex(
                f"{SUMMARY_KEY_PREFIX}{self.conversation_key}", CACHE_TTL * 10, summary
            )
            logger.info("记忆摘要已生成 key=%s", self.conversation_key)
            return True
        except Exception as exc:  # 摘要失败不影响主流程
            logger.warning("记忆摘要生成失败: %s", exc)
            return False
