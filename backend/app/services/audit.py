"""审计服务：治理事件持久化。"""

import logging

from app.core.deps import SessionLocal
from app.core.middleware import redact, request_id_var
from app.models.audit import AuditLog

logger = logging.getLogger("careerkit.audit")


def audit(action: str, subject: str = "", detail: dict | None = None) -> None:
    """写入审计日志。失败不影响主流程（仅告警）。"""
    try:
        with SessionLocal() as db:
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
