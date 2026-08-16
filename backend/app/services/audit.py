"""审计服务：治理事件持久化。"""

import logging

from app.core.deps import SessionLocal
from app.core.middleware import redact, request_id_var
from app.models.audit import AuditLog

logger = logging.getLogger("careerkit.audit")


def audit(action: str, subject: str = "", detail: dict | None = None, db=None) -> None:
    """写入审计日志。失败不影响主流程（仅告警）。

    db 由调用方传入时复用其会话（避免每次审计新开连接）；否则自行开会话。
    """
    own_session = db is None
    if own_session:
        db = SessionLocal()
    try:
        db.add(
            AuditLog(
                request_id=request_id_var.get(),
                action=action,
                subject=subject,
                detail=redact(detail or {}),
            )
        )
        db.commit()
    except Exception as exc:
        logger.warning("审计写入失败 action=%s subject=%s err=%s", action, subject, exc)
        if own_session:
            db.rollback()
    finally:
        if own_session:
            db.close()
