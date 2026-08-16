"""混合检索（RAG）：BM25 关键词 + pgvector 向量 + RRF 融合。

参考 AgentForge 检索架构，将 MongoDB+Milvus 双层存储收敛到 PostgreSQL 单库：
- 关键词检索：pg_trgm 相似度（替代 BM25）
- 向量检索：pgvector 余弦距离 + HNSW 索引
- 融合排序：RRF（Reciprocal Rank Fusion）
"""

import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.knowledge import KnowledgeBase, KnowledgeChunk

logger = logging.getLogger("careerkit.retriever")

RRF_K = 60  # RRF 常数
TOP_K = 8


def _keyword_search(db: Session, kb_ids: list[int], query: str, top_k: int) -> list[tuple[int, float]]:
    """pg_trgm 相似度检索，返回 (chunk_id, score)。"""
    sql = text(
        """
        SELECT id, similarity(content, :q) AS score
        FROM knowledge_chunks
        WHERE knowledge_base_id = ANY(:kb_ids) AND similarity(content, :q) > 0.1
        ORDER BY score DESC
        LIMIT :top_k
        """
    )
    rows = db.execute(sql, {"q": query, "kb_ids": kb_ids, "top_k": top_k}).fetchall()
    return [(int(r.id), float(r.score)) for r in rows]


def _vector_search(db: Session, kb_ids: list[int], embedding: list[float], top_k: int) -> list[tuple[int, float]]:
    """pgvector 余弦距离检索，返回 (chunk_id, score=1-distance)。"""
    sql = text(
        """
        SELECT id, 1 - (embedding <=> :emb) AS score
        FROM knowledge_chunks
        WHERE knowledge_base_id = ANY(:kb_ids) AND embedding IS NOT NULL
        ORDER BY embedding <=> :emb
        LIMIT :top_k
        """
    )
    rows = db.execute(sql, {"emb": embedding, "kb_ids": kb_ids, "top_k": top_k}).fetchall()
    return [(int(r.id), float(r.score)) for r in rows]


def _rrf_merge(ranked_lists: list[list[tuple[int, float]]], top_k: int) -> list[int]:
    """RRF 融合多路排序。"""
    scores: dict[int, float] = {}
    for ranked in ranked_lists:
        for rank, (chunk_id, _) in enumerate(ranked):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank + 1)
    ordered = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    return [cid for cid, _ in ordered[:top_k]]


def hybrid_search(
    db: Session,
    query: str,
    embedding: list[float] | None,
    kb_ids: list[int] | None = None,
    top_k: int = TOP_K,
) -> list[dict]:
    """混合检索主入口。返回 [{chunk_id, content, metadata, source_file, score}]。"""
    kb_ids = kb_ids or [kb.id for kb in db.query(KnowledgeBase).all()]
    if not kb_ids:
        return []

    lists: list[list[tuple[int, float]]] = [_keyword_search(db, kb_ids, query, top_k)]
    if embedding:
        lists.append(_vector_search(db, kb_ids, embedding, top_k))

    merged = _rrf_merge(lists, top_k)
    if not merged:
        return []

    chunks = db.query(KnowledgeChunk).filter(KnowledgeChunk.id.in_(merged)).all()
    by_id = {c.id: c for c in chunks}
    results = []
    for chunk_id in merged:
        chunk = by_id.get(chunk_id)
        if chunk:
            results.append(
                {
                    "chunk_id": chunk.id,
                    "content": chunk.content,
                    "metadata": chunk.doc_meta,
                    "source_file": chunk.source_file,
                    "knowledge_base_id": chunk.knowledge_base_id,
                }
            )
    return results
