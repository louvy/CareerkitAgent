"""Trace 收集器：内存中累积一次 Agent 运行的全部事件，最终持久化。"""

import time
import uuid
from typing import Any

from app.core.middleware import redact


class TraceCollector:
    """事件序列收集器。每条事件带时间戳与请求 ID，支持事后回放调试。"""

    def __init__(self) -> None:
        self.run_id = uuid.uuid4().hex[:16]
        self.events: list[dict[str, Any]] = []
        self.prompts: list[dict[str, Any]] = []
        self.final_output: Any = None

    def add_event(self, kind: str, payload: dict[str, Any] | None = None) -> None:
        self.events.append(
            {"ts": time.time(), "kind": kind, "payload": redact(payload or {})}
        )

    def record_prompt(self, system: str, user: str, *, model: str) -> None:
        self.prompts.append(
            {"ts": time.time(), "model": model, "system": system, "user": user[:4000]}
        )

    def snapshot(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "events": self.events,
            "prompts": self.prompts,
            "final_output": redact(self.final_output),
        }
