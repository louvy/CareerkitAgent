"""模型管理 API：chat / embedding 分类 CRUD、连接测试、默认模型设置。"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.exceptions import NotFoundError
from app.models.llm_model import LLMModel
from app.services.audit import audit
from app.services.crypto import decrypt_value, encrypt_value

router = APIRouter(prefix="/api/models", tags=["models"])

VALID_CATEGORIES = ("chat", "embedding")


class ModelIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(description="chat / embedding")
    model: str = Field(min_length=1, max_length=120, description="供应商实际模型名")
    base_url: str = Field(default="", description="OpenAI 兼容 Base URL")
    api_key: str = Field(default="", description="明文提交，服务端加密存储；留空保持原 Key")
    description: str = Field(default="")
    is_default: bool = False


def _get_model(db: Session, model_id: int) -> LLMModel:
    model = db.get(LLMModel, model_id)
    if model is None:
        raise NotFoundError(f"模型 {model_id} 不存在")
    return model


def _model_dict(m: LLMModel) -> dict:
    key = decrypt_value(m.api_key) if m.api_key else ""
    return {
        "id": m.id,
        "name": m.name,
        "category": m.category,
        "model": m.model,
        "base_url": m.base_url,
        "api_key_masked": f"{key[:6]}****{key[-4:]}" if key else "",
        "has_api_key": bool(key),
        "description": m.description,
        "is_default": m.is_default,
        "created_at": m.created_at,
        "updated_at": m.updated_at,
    }


def _validate_category(category: str) -> None:
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"分类必须为 {'/'.join(VALID_CATEGORIES)}")


def _clear_default(db: Session, category: str, except_id: int | None = None) -> None:
    """同分类下仅允许一个默认模型。"""
    query = db.query(LLMModel).filter(LLMModel.category == category, LLMModel.is_default.is_(True))
    if except_id is not None:
        query = query.filter(LLMModel.id != except_id)
    for row in query.all():
        row.is_default = False


@router.get("")
def list_models(category: str | None = None, db: Session = Depends(get_db)):
    """模型列表。category 过滤（chat / embedding）。"""
    query = db.query(LLMModel)
    if category:
        query = query.filter(LLMModel.category == category)
    models = query.order_by(LLMModel.category.asc(), LLMModel.id.asc()).all()
    return [_model_dict(m) for m in models]


@router.post("")
def create_model(payload: ModelIn, db: Session = Depends(get_db)):
    """新增模型。chat 类型可供 Agent 选择，embedding 供知识库向量化。"""
    _validate_category(payload.category)
    row = LLMModel(
        name=payload.name,
        category=payload.category,
        model=payload.model,
        base_url=payload.base_url,
        api_key=encrypt_value(payload.api_key) if payload.api_key else "",
        description=payload.description,
        is_default=payload.is_default,
    )
    if payload.is_default:
        _clear_default(db, payload.category)
    db.add(row)
    db.commit()
    audit("model.create", f"model:{row.model}", {"category": row.category}, db=db)
    return _model_dict(row)


@router.put("/{model_id}")
def update_model(model_id: int, payload: ModelIn, db: Session = Depends(get_db)):
    """更新模型（api_key 留空保持原 Key）。"""
    row = _get_model(db, model_id)
    _validate_category(payload.category)
    row.name = payload.name
    row.category = payload.category
    row.model = payload.model
    row.base_url = payload.base_url
    if payload.api_key:
        row.api_key = encrypt_value(payload.api_key)
    row.description = payload.description
    if payload.is_default and not row.is_default:
        _clear_default(db, payload.category, except_id=row.id)
    row.is_default = payload.is_default
    db.commit()
    audit("model.update", f"model:{row.model}", {"model_id": model_id}, db=db)
    return _model_dict(row)


@router.post("/{model_id}/set-default")
def set_default(model_id: int, db: Session = Depends(get_db)):
    """设为该分类的默认模型。"""
    row = _get_model(db, model_id)
    _clear_default(db, row.category, except_id=row.id)
    row.is_default = True
    db.commit()
    audit("model.set_default", f"model:{row.model}", {"model_id": model_id}, db=db)
    return _model_dict(row)


@router.delete("/{model_id}")
def delete_model(model_id: int, db: Session = Depends(get_db)):
    """删除模型（默认模型不可删，先切换默认）。"""
    row = _get_model(db, model_id)
    if row.is_default:
        raise HTTPException(status_code=409, detail="默认模型不可删除，请先切换默认模型")
    db.delete(row)
    db.commit()
    audit("model.delete", f"model:{row.model}", {"model_id": model_id}, db=db)
    return {"message": "已删除"}


@router.post("/{model_id}/test")
def test_model(model_id: int, db: Session = Depends(get_db)):
    """连接测试：真实调用一次最小请求。chat 走 chat.completions，embedding 走 embeddings。"""
    row = _get_model(db, model_id)
    api_key = decrypt_value(row.api_key) if row.api_key else ""
    if not api_key:
        return {"ok": False, "error": "未配置 API Key"}

    from openai import OpenAI

    kwargs: dict = {"api_key": api_key}
    if row.base_url:
        kwargs["base_url"] = row.base_url
    client = OpenAI(**kwargs)
    try:
        if row.category == "chat":
            resp = client.chat.completions.create(
                model=row.model,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=5,
            )
            reply = (resp.choices[0].message.content or "")[:50]
            return {"ok": True, "reply": reply or "连接成功"}
        resp = client.embeddings.create(model=row.model, input=["ping"])
        dim = len(resp.data[0].embedding) if resp.data else 0
        return {"ok": True, "reply": f"向量维度 {dim}", "dim": dim}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:300]}
