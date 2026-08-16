"""工具库 API：http / mcp 两类自定义工具 CRUD（AgentForge Tool Library）。"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.exceptions import NotFoundError
from app.models.tool import Tool
from app.services.audit import audit

router = APIRouter(prefix="/api/tools", tags=["tools"])

VALID_CATEGORIES = ("http", "mcp")


class ToolIn(BaseModel):
    name: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_.-]+$")
    category: str = Field(description="http / mcp")
    description: str = ""
    config: dict = Field(default_factory=dict)


def _get_tool(db: Session, tool_id: int) -> Tool:
    tool = db.get(Tool, tool_id)
    if tool is None:
        raise NotFoundError(f"工具 {tool_id} 不存在")
    return tool


def _tool_dict(t: Tool) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "category": t.category,
        "description": t.description,
        "config": t.config,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


def _validate(payload: ToolIn) -> None:
    if payload.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"分类必须为 {'/'.join(VALID_CATEGORIES)}")
    if payload.category == "http":
        method = str(payload.config.get("method", "")).upper()
        url = str(payload.config.get("url", ""))
        if method not in ("GET", "POST", "PUT", "DELETE", "PATCH"):
            raise HTTPException(status_code=422, detail="HTTP 工具必须配置 method (GET/POST/PUT/DELETE/PATCH)")
        if not url.startswith(("http://", "https://")):
            raise HTTPException(status_code=422, detail="HTTP 工具必须配置合法的 url")
    elif payload.category == "mcp":
        if not str(payload.config.get("command", "")).strip():
            raise HTTPException(status_code=422, detail="MCP 工具必须配置 command")


@router.get("")
def list_tools(category: str | None = None, db: Session = Depends(get_db)):
    """工具库列表。category 过滤（http / mcp）。"""
    query = db.query(Tool)
    if category:
        query = query.filter(Tool.category == category)
    tools = query.order_by(Tool.category.asc(), Tool.id.asc()).all()
    return [_tool_dict(t) for t in tools]


@router.post("")
def create_tool(payload: ToolIn, db: Session = Depends(get_db)):
    """新增工具。"""
    _validate(payload)
    exists = db.query(Tool).filter(Tool.name == payload.name).first()
    if exists is not None:
        raise HTTPException(status_code=409, detail=f"工具名「{payload.name}」已存在")
    tool = Tool(
        name=payload.name,
        category=payload.category,
        description=payload.description,
        config=payload.config,
    )
    db.add(tool)
    db.commit()
    audit("tool.create", f"tool:{tool.name}", {"category": tool.category}, db=db)
    return _tool_dict(tool)


@router.put("/{tool_id}")
def update_tool(tool_id: int, payload: ToolIn, db: Session = Depends(get_db)):
    """更新工具。"""
    tool = _get_tool(db, tool_id)
    _validate(payload)
    dup = db.query(Tool).filter(Tool.name == payload.name, Tool.id != tool_id).first()
    if dup is not None:
        raise HTTPException(status_code=409, detail=f"工具名「{payload.name}」已存在")
    tool.name = payload.name
    tool.category = payload.category
    tool.description = payload.description
    tool.config = payload.config
    db.commit()
    audit("tool.update", f"tool:{tool.name}", {"tool_id": tool_id}, db=db)
    return _tool_dict(tool)


@router.delete("/{tool_id}")
def delete_tool(tool_id: int, db: Session = Depends(get_db)):
    tool = _get_tool(db, tool_id)
    db.delete(tool)
    db.commit()
    audit("tool.delete", f"tool:{tool.name}", {"tool_id": tool_id}, db=db)
    return {"message": "已删除"}
