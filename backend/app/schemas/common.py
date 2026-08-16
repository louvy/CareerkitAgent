"""通用 API 响应模型。"""

from pydantic import BaseModel


class MessageOut(BaseModel):
    message: str


class IdOut(BaseModel):
    id: int
