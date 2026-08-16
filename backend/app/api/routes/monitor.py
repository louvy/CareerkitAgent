"""系统监控 API：基础设施状态 + Token 消耗统计（按日期，区分 Agent / 用户）。"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query
from sqlalchemy import text

from app.core.deps import SessionLocal, engine, redis_client

router = APIRouter(prefix="/api/monitor", tags=["monitor"])

# Token 统计按 Asia/Shanghai 时区归日，日期窗口必须与该时区对齐
_SH_TZ = ZoneInfo("Asia/Shanghai")


def _check_postgres() -> dict:
    try:
        with engine.connect() as conn:
            version = conn.execute(text("SELECT version()")).scalar()
            tables = conn.execute(
                text("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
            ).scalar()
            vector_ok = conn.execute(
                text("SELECT count(*) FROM pg_extension WHERE extname='vector'")
            ).scalar()
            trgm_ok = conn.execute(
                text("SELECT count(*) FROM pg_extension WHERE extname='pg_trgm'")
            ).scalar()
        return {
            "ok": True,
            "version": version.split(" on ")[0].split(" ")[1] if version else "",
            "tables": int(tables or 0),
            "pgvector": bool(vector_ok),
            "pg_trgm": bool(trgm_ok),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}


def _check_redis() -> dict:
    try:
        pong = redis_client.ping()
        info = redis_client.info("server") if pong else {}
        return {"ok": bool(pong), "version": info.get("redis_version", ""), "keys": redis_client.dbsize()}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}


def _check_minio() -> dict:
    from app.services.storage import get_client

    try:
        client = get_client()
        buckets = [b.name for b in client.list_buckets()]
        return {"ok": True, "buckets": buckets}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}


@router.get("/system")
def system_status():
    """基础设施状态：PostgreSQL（含 pgvector）、Redis、MinIO。"""
    return {
        "postgres": _check_postgres(),
        "redis": _check_redis(),
        "minio": _check_minio(),
    }


@router.get("/tokens")
def token_stats(
    start: date | None = Query(default=None, description="起始日期（含）"),
    end: date | None = Query(default=None, description="结束日期（含）"),
    days: int = Query(default=14, ge=1, le=92, description="默认回溯天数"),
):
    """Token 消耗按日期聚合。用户消耗 = 输入 token，Agent 消耗 = 输出 token。"""
    today = datetime.now(_SH_TZ).date()
    end_date = end or today
    start_date = start or (end_date - timedelta(days=days - 1))
    if start_date > end_date:
        start_date, end_date = end_date, start_date

    with SessionLocal() as db:
        rows = db.execute(
            text(
                """
                SELECT to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS d,
                       COALESCE(SUM((stats->>'token_input')::int), 0)   AS user_tokens,
                       COALESCE(SUM((stats->>'token_output')::int), 0)  AS agent_tokens,
                       COUNT(*) AS runs
                FROM agent_runs
                WHERE created_at >= :start AND created_at < :end_plus
                  AND stats IS NOT NULL
                GROUP BY d
                ORDER BY d
                """
            ),
            {
                "start": datetime.combine(start_date, datetime.min.time(), tzinfo=_SH_TZ),
                "end_plus": datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=_SH_TZ),
            },
        ).all()

    # 补全天序列（无数据日期补零，便于图表连续）
    by_day = {r[0]: {"date": r[0], "user_tokens": int(r[1] or 0), "agent_tokens": int(r[2] or 0), "runs": int(r[3] or 0)} for r in rows}
    result = []
    cursor = start_date
    while cursor <= end_date:
        key = cursor.isoformat()
        result.append(by_day.get(key, {"date": key, "user_tokens": 0, "agent_tokens": 0, "runs": 0}))
        cursor += timedelta(days=1)
    return {"start": start_date.isoformat(), "end": end_date.isoformat(), "items": result}
