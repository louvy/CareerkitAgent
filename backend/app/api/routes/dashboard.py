"""控制中心 API：统计卡片数据（对应 Lujie Dashboard 指标）。"""

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models.interview import InterviewQuestion, InterviewReview, InterviewSession
from app.models.jd import JD, JDMatch
from app.models.resume import Resume
from app.models.agent import AgentRun

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    resume_count = db.query(func.count(Resume.id)).scalar() or 0
    jd_count = db.query(func.count(JD.id)).scalar() or 0
    match_count = db.query(func.count(JDMatch.id)).scalar() or 0
    question_count = db.query(func.count(InterviewQuestion.id)).scalar() or 0
    session_count = db.query(func.count(InterviewSession.id)).scalar() or 0
    review_count = db.query(func.count(InterviewReview.id)).scalar() or 0
    run_count = db.query(func.count(AgentRun.id)).scalar() or 0
    return {
        "resume_count": resume_count,
        "jd_count": jd_count,
        "match_count": match_count,
        "question_count": question_count,
        "session_count": session_count,
        "review_count": review_count,
        "run_count": run_count,
    }
