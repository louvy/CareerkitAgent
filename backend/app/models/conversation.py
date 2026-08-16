"""会话消息：Agent 对话历史（配合记忆模块的滑动窗口+滚动摘要）。"""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ConversationMessage(Base):
    """一条会话消息。role: user/assistant/system。"""

    __tablename__ = "conversation_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 会话键：如 interview-coach:<session_id>，命名空间隔离
    conversation_key: Mapped[str] = mapped_column(String(120), index=True)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    # 附加数据：{token_input, token_output, tool_calls}
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
