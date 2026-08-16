"""pytest 共享配置：测试数据库隔离 + 公共 fixture。"""

import os

# 必须在导入 app 之前设置，deps.py 会按此创建引擎
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://careerkit:careerkit@localhost:5432/careerkit_test")
os.environ.setdefault("CAREERKIT_SECRET", "pytest-secret-key-for-encryption-32bytes!!")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.deps import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

# 全部业务表（TRUNCATE 用）
_ALL_TABLES = (
    "agent_runs, agent_traces, conversation_messages, interview_answers, interview_reviews, "
    "interview_questions, interview_sessions, jd_matches, jds, resume_versions, resumes, "
    "knowledge_chunks, knowledge_bases, audit_logs, agents, llm_models, tools"
)


@pytest.fixture(scope="session", autouse=True)
def _ensure_schema():
    """测试库建表：vector 扩展 + 全部 ORM 表（幂等）。"""
    from app.models.base import Base

    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    Base.metadata.create_all(engine)
    yield


@pytest.fixture()
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture(autouse=True)
def clean_tables(db):
    """每个测试前清空业务表，保证隔离。"""
    with engine.connect() as conn:
        conn.execute(text(f"TRUNCATE {_ALL_TABLES} RESTART IDENTITY CASCADE"))
        conn.commit()
    yield


@pytest.fixture()
def client():
    """TestClient：lifespan 自动执行内置 Agent 种子。"""
    from app.agents.registry import seed_builtin_agents

    with SessionLocal() as session:
        seed_builtin_agents(session)
    with TestClient(app) as c:  # noqa: F821
        yield c
