"""知识库 API：文档上传→切块→向量化→混合检索（MinIO + pgvector）。

支持按库配置切块策略（auto 段落感知 / fixed 固定窗口）、切块大小与重叠，
以及选择 embedding 模型向量化；提供切块预览（不落库）。
"""

import io
import logging
import re

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.exceptions import NotFoundError
from app.models.knowledge import KnowledgeBase, KnowledgeChunk
from app.services.embedding import embed_texts
from app.services.retriever import hybrid_search
from app.services.storage import delete_object, upload_fileobj

logger = logging.getLogger("careerkit.knowledge")

router = APIRouter(prefix="/api", tags=["knowledge"])

CHUNK_SIZE_DEFAULT = 800
CHUNK_OVERLAP_DEFAULT = 100
CHUNK_STRATEGIES = ("auto", "fixed")


def split_text(
    text: str, strategy: str = "auto", chunk_size: int = CHUNK_SIZE_DEFAULT, chunk_overlap: int = CHUNK_OVERLAP_DEFAULT
) -> list[str]:
    """按策略切块。auto：优先段落边界，其次换行与句号；fixed：纯固定窗口。均带重叠。"""
    text = re.sub(r"\n{3,}", "\n\n", text.strip())
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if end < len(text):
            boundary = -1
            if strategy != "fixed":
                boundary = text.rfind("\n\n", start + chunk_size // 2, end)
                if boundary <= 0:
                    boundary = text.rfind("\n", start + chunk_size // 2, end)
                if boundary <= 0:
                    boundary = text.rfind("。", start + chunk_size // 2, end)
            if boundary > 0:
                end = boundary
        chunks.append(text[start:end].strip())
        start = end - chunk_overlap if end < len(text) else end
    return [c for c in chunks if c]


class KnowledgeBaseIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="")
    chunk_strategy: str = Field(default="auto", description="auto（段落感知）/ fixed（固定窗口）")
    chunk_size: int = Field(default=CHUNK_SIZE_DEFAULT, ge=100, le=4000)
    chunk_overlap: int = Field(default=CHUNK_OVERLAP_DEFAULT, ge=0, le=500)
    embedding_model_id: int | None = Field(default=None, description="向量化 embedding 模型；空用全局默认")

    @field_validator("chunk_overlap")
    @classmethod
    def overlap_must_lt_size(cls, v: int, info):
        size = info.data.get("chunk_size")
        if size is not None and v >= size:
            raise ValueError("重叠长度必须小于切块大小")
        return v


class PreviewRequest(BaseModel):
    text: str = Field(min_length=1, description="待切块的文本（用于预览，不落库）")
    chunk_strategy: str = "auto"
    chunk_size: int = CHUNK_SIZE_DEFAULT
    chunk_overlap: int = CHUNK_OVERLAP_DEFAULT

    @field_validator("chunk_overlap")
    @classmethod
    def overlap_must_lt_size(cls, v: int, info):
        size = info.data.get("chunk_size")
        if size is not None and v >= size:
            raise ValueError("重叠长度必须小于切块大小")
        return v


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    kb_ids: list[int] = Field(default_factory=list)
    top_k: int = 5


def _get_kb(db: Session, kb_id: int) -> KnowledgeBase:
    kb = db.get(KnowledgeBase, kb_id)
    if kb is None:
        raise NotFoundError(f"知识库 {kb_id} 不存在")
    return kb


def _kb_dict(kb: KnowledgeBase) -> dict:
    return {
        "id": kb.id,
        "name": kb.name,
        "description": kb.description,
        "chunk_strategy": kb.chunk_strategy,
        "chunk_size": kb.chunk_size,
        "chunk_overlap": kb.chunk_overlap,
        "embedding_model_id": kb.embedding_model_id,
        "chunk_count": len(kb.chunks),
        "created_at": kb.created_at,
    }


@router.get("/knowledge-bases")
def list_kb(db: Session = Depends(get_db)):
    kbs = db.query(KnowledgeBase).order_by(KnowledgeBase.id.desc()).all()
    return [_kb_dict(kb) for kb in kbs]


@router.post("/knowledge-bases")
def create_kb(payload: KnowledgeBaseIn, db: Session = Depends(get_db)):
    if payload.chunk_strategy not in CHUNK_STRATEGIES:
        payload.chunk_strategy = "auto"
    kb = KnowledgeBase(
        name=payload.name,
        description=payload.description,
        chunk_strategy=payload.chunk_strategy,
        chunk_size=payload.chunk_size,
        chunk_overlap=payload.chunk_overlap,
        embedding_model_id=payload.embedding_model_id,
    )
    db.add(kb)
    db.commit()
    return {"id": kb.id, "name": kb.name}


@router.put("/knowledge-bases/{kb_id}")
def update_kb(kb_id: int, payload: KnowledgeBaseIn, db: Session = Depends(get_db)):
    """更新知识库配置（名称/描述/切块策略/embedding 模型）。"""
    kb = _get_kb(db, kb_id)
    kb.name = payload.name
    kb.description = payload.description
    if payload.chunk_strategy in CHUNK_STRATEGIES:
        kb.chunk_strategy = payload.chunk_strategy
    kb.chunk_size = payload.chunk_size
    kb.chunk_overlap = payload.chunk_overlap
    kb.embedding_model_id = payload.embedding_model_id
    db.commit()
    return _kb_dict(kb)


@router.post("/knowledge-bases/preview-chunks")
def preview_chunks(payload: PreviewRequest):
    """切块预览：按策略/大小/重叠返回分块结果与统计（不落库）。"""
    chunks = split_text(payload.text, payload.chunk_strategy, payload.chunk_size, payload.chunk_overlap)
    return {
        "chunks": chunks,
        "count": len(chunks),
        "total_chars": len(payload.text),
        "strategy": payload.chunk_strategy,
        "chunk_size": payload.chunk_size,
        "chunk_overlap": payload.chunk_overlap,
    }


@router.delete("/knowledge-bases/{kb_id}")
def delete_kb(kb_id: int, db: Session = Depends(get_db)):
    kb = _get_kb(db, kb_id)
    objects = [c.source_file for c in kb.chunks if c.source_file]
    db.delete(kb)
    db.commit()
    for obj in set(objects):
        try:
            delete_object(obj)
        except Exception:
            logger.warning("MinIO 对象清理失败: %s", obj)
    return {"message": "已删除"}


@router.post("/knowledge-bases/{kb_id}/upload")
async def upload_documents(kb_id: int, files: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    """上传文档（txt/md），按知识库切块配置分片，用指定 embedding 模型向量化入库。"""
    kb = _get_kb(db, kb_id)
    results = []
    for file in files:
        data = await file.read()
        text = data.decode("utf-8", errors="ignore")
        # 原文存 MinIO（知识库原始文档）
        obj_name = upload_fileobj(
            "knowledge", file.filename or "doc.txt", io.BytesIO(data), len(data),
            file.content_type or "text/plain",
        )
        chunks = split_text(text, kb.chunk_strategy, kb.chunk_size, kb.chunk_overlap)
        if not chunks:
            results.append({"file": file.filename, "chunks": 0, "message": "空文档"})
            continue
        vectors = embed_texts(chunks, embedding_model_id=kb.embedding_model_id) if chunks else []
        for idx, (chunk, vector) in enumerate(zip(chunks, vectors, strict=False)):
            db.add(
                KnowledgeChunk(
                    knowledge_base_id=kb_id,
                    source_file=obj_name,
                    chunk_index=idx,
                    content=chunk,
                    embedding=vector if vector else None,
                    doc_meta={"title": file.filename, "chunk_index": idx},
                )
            )
        db.commit()
        results.append({"file": file.filename, "chunks": len(chunks), "message": "已入库"})
    return {"results": results}


@router.post("/knowledge/search")
def search(payload: SearchRequest, db: Session = Depends(get_db)):
    """检索测试：混合检索（关键词 + 向量 + RRF）。"""
    from app.services.embedding import embed_text

    kbs = db.query(KnowledgeBase).filter(KnowledgeBase.id.in_(payload.kb_ids)).all() if payload.kb_ids else []
    embedding = embed_text(payload.query, embedding_model_id=kbs[0].embedding_model_id if kbs else None)
    results = hybrid_search(db, payload.query, embedding if embedding else None, kb_ids=payload.kb_ids or None, top_k=payload.top_k)
    return {"results": results}
