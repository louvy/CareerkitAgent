"""JD 匹配 API：JD 管理 + 匹配任务（走 jd-matcher Agent）。"""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.business.jd import run_jd_match
from app.api.routes.pipeline import run_harness_pipeline
from app.core.deps import get_db
from app.core.exceptions import NotFoundError
from app.models.jd import JD, JDMatch
from app.schemas.jd import JDMatchResult

router = APIRouter(prefix="/api", tags=["jd"])


class JDCreate(BaseModel):
    company: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=10)


class MatchRequest(BaseModel):
    resume_version_id: int


def _get_jd(db: Session, jd_id: int) -> JD:
    jd = db.get(JD, jd_id)
    if jd is None:
        raise NotFoundError(f"JD {jd_id} 不存在")
    return jd


@router.get("/jds")
def list_jds(db: Session = Depends(get_db)):
    jds = db.query(JD).order_by(JD.created_at.desc()).all()
    return [
        {
            "id": j.id,
            "company": j.company,
            "title": j.title,
            "content": j.content[:300],
            "created_at": j.created_at,
        }
        for j in jds
    ]


@router.post("/jds")
def create_jd(payload: JDCreate, db: Session = Depends(get_db)):
    jd = JD(company=payload.company, title=payload.title, content=payload.content)
    db.add(jd)
    db.commit()
    return {"id": jd.id, "company": jd.company, "title": jd.title}


@router.get("/jds/{jd_id}")
def get_jd_detail(jd_id: int, db: Session = Depends(get_db)):
    jd = _get_jd(db, jd_id)
    return {"id": jd.id, "company": jd.company, "title": jd.title, "content": jd.content, "created_at": jd.created_at}


@router.delete("/jds/{jd_id}")
def delete_jd(jd_id: int, db: Session = Depends(get_db)):
    jd = _get_jd(db, jd_id)
    db.delete(jd)
    db.commit()
    return {"message": "已删除"}


@router.post("/jds/{jd_id}/match")
def run_match(jd_id: int, payload: MatchRequest, db: Session = Depends(get_db)):
    """执行 JD 匹配：走 jd-matcher Agent 的 Harness 管道。"""
    from app.models.resume import ResumeVersion

    jd = _get_jd(db, jd_id)
    version = db.get(ResumeVersion, payload.resume_version_id)
    if version is None:
        raise NotFoundError(f"简历版本 {payload.resume_version_id} 不存在")

    def executor(ctx, guard):
        result = run_jd_match(payload.resume_version_id, jd_id, ctx, guard)
        return {"output": result.model_dump()}

    result = run_harness_pipeline(
        db,
        "jd-matcher",
        task_description=f"JD 匹配 jd:{jd_id} resume_version:{payload.resume_version_id}",
        user_input="请执行简历与 JD 的匹配诊断",
        context={"jd_id": jd_id, "resume_version_id": payload.resume_version_id},
        executor=executor,
        source_text=f"{jd.content}\n\n{version.plain_text}",
    )
    match_result = JDMatchResult.model_validate(result["output"])
    match = JDMatch(
        jd_id=jd_id,
        resume_version_id=payload.resume_version_id,
        overview={
            "overall_score": match_result.overall_score,
            "summary": match_result.summary,
            "per_requirement": [r.model_dump() for r in match_result.per_requirement],
        },
        suggestions={
            "reorder": match_result.reorder,
            "wording": match_result.wording,
            "matched_strengths": match_result.matched_strengths,
            "missing_facts": match_result.missing_facts,
        },
        gate=result.get("gate", {}),
        status="completed",
    )
    db.add(match)
    db.commit()
    return {
        "id": match.id,
        "result": match_result.model_dump(),
        "run_id": result.get("run_id"),
        "review": result.get("review"),
        "decision": result.get("decision"),
    }


@router.get("/jd-matches/{match_id}")
def get_match(match_id: int, db: Session = Depends(get_db)):
    match = db.get(JDMatch, match_id)
    if match is None:
        raise NotFoundError(f"匹配记录 {match_id} 不存在")
    return {
        "id": match.id,
        "jd_id": match.jd_id,
        "resume_version_id": match.resume_version_id,
        "result_version_id": match.result_version_id,
        "overview": match.overview,
        "suggestions": match.suggestions,
        "gate": match.gate,
        "status": match.status,
        "created_at": match.created_at,
    }
