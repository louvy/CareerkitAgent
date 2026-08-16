"""CareerkitAgent 后端入口：FastAPI 应用装配。

装配顺序：CORS → 可观测中间件 → 异常处理器 → 路由 → 启动种子（工具/内置 Agent）。
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.deps import SessionLocal
from app.core.exceptions import register_exception_handlers
from app.core.middleware import ObservabilityMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("careerkit")


@asynccontextmanager
async def lifespan(_: FastAPI):
    """启动：注册工具 + 种子内置 Agent。"""
    import app.agents.tools as tools  # noqa: F401  触发工具注册
    from app.agents.registry import seed_builtin_agents

    try:
        with SessionLocal() as db:
            seed_builtin_agents(db)
        logger.info("内置 Agent 种子完成")
    except Exception as exc:
        logger.warning("种子初始化跳过（数据库未就绪?）: %s", exc)
    yield


app = FastAPI(title="CareerkitAgent API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ObservabilityMiddleware)
register_exception_handlers(app)

from app.api.routes import agents, dashboard, interview, jd, knowledge, models, monitor, resume, tools  # noqa: E402

for router in (
    resume.router,
    jd.router,
    interview.router,
    agents.router,
    knowledge.router,
    models.router,
    tools.router,
    monitor.router,
    dashboard.router,
):
    app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok"}
