"""面试刷题 API：会话、题目、作答、AI 复盘、模拟面试教练。"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.business.interview import run_coach_turn, run_generate_questions, run_review_answers
from app.agents.runtime import AgentRuntime
from app.core.deps import get_db
from app.harness.constitution import constitution_text
from app.core.exceptions import NotFoundError
from app.models.interview import (
    InterviewAnswer,
    InterviewQuestion,
    InterviewReview,
    InterviewSession,
)
from app.schemas.interview import InterviewQuestionSet, InterviewReviewReport
from app.services.memory import MemoryService

router = APIRouter(prefix="/api", tags=["interview"])


class SessionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    resume_version_id: int
    jd_id: int | None = None


class AnswerSave(BaseModel):
    content: str = ""


class CoachTurn(BaseModel):
    message: str = Field(min_length=1)


def _get_session(db: Session, session_id: int) -> InterviewSession:
    session = db.get(InterviewSession, session_id)
    if session is None:
        raise NotFoundError(f"面试会话 {session_id} 不存在")
    return session


def _session_dict(session: InterviewSession, db: Session | None = None) -> dict:
    questions = []
    for q in session.questions:
        item = {
            "id": q.id,
            "order_no": q.order_no,
            "category": q.category,
            "question": q.question,
            "intent": q.intent,
            "reference_points": q.reference_points,
        }
        if db is not None:
            answer = (
                db.query(InterviewAnswer).filter(InterviewAnswer.question_id == q.id).first()
            )
            item["answer"] = answer.content if answer else ""
        questions.append(item)
    return {
        "id": session.id,
        "title": session.title,
        "resume_version_id": session.resume_version_id,
        "jd_id": session.jd_id,
        "status": session.status,
        "created_at": session.created_at,
        "questions": questions,
    }


@router.get("/interview-sessions")
def list_sessions(db: Session = Depends(get_db)):
    sessions = db.query(InterviewSession).order_by(InterviewSession.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "title": s.title,
            "status": s.status,
            "created_at": s.created_at,
            "question_count": len(s.questions),
        }
        for s in sessions
    ]


@router.get("/interview-sessions/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db)):
    session = _get_session(db, session_id)
    data = _session_dict(session, db)
    review = db.query(InterviewReview).filter(InterviewReview.session_id == session_id).order_by(InterviewReview.id.desc()).first()
    if review:
        data["review"] = {"id": review.id, "report": review.report, "gate": review.gate, "created_at": review.created_at}
    return data


@router.post("/interview-sessions")
def create_session(payload: SessionCreate, db: Session = Depends(get_db)):
    """创建会话并出题（走 interview-generator Agent）。"""
    from app.models.agent import Agent
    from app.models.resume import ResumeVersion

    version = db.get(ResumeVersion, payload.resume_version_id)
    if version is None:
        raise NotFoundError(f"简历版本 {payload.resume_version_id} 不存在")
    agent = db.query(Agent).filter(Agent.name == "interview-generator").first()
    if agent is None:
        raise NotFoundError("内置 Agent interview-generator 不存在")

    def executor(ctx, guard):
        result = run_generate_questions(payload.resume_version_id, payload.jd_id, ctx, guard)
        return {"output": result.model_dump()}

    runtime = AgentRuntime(agent, db)
    result = runtime.run(
        task_description=f"面试出题 resume_version:{payload.resume_version_id} jd:{payload.jd_id or '无'}",
        user_input="请基于简历与 JD 生成面试题目",
        context={"resume_version_id": payload.resume_version_id, "jd_id": payload.jd_id},
        executor=executor,
        source_text=version.plain_text,
    )
    question_set = InterviewQuestionSet.model_validate(result["output"])

    session = InterviewSession(
        title=payload.title,
        resume_version_id=payload.resume_version_id,
        jd_id=payload.jd_id,
        profile={"summary": question_set.summary, "groups": [g.model_dump() for g in question_set.groups]},
    )
    db.add(session)
    db.flush()
    order = 0
    for group in question_set.groups:
        for item in group.questions:
            db.add(
                InterviewQuestion(
                    session_id=session.id,
                    order_no=order,
                    category=item.category,
                    question=item.question,
                    intent=item.intent,
                    reference_points=item.reference_points,
                )
            )
            order += 1
    db.commit()
    return {
        "id": session.id,
        "profile": session.profile,
        "run_id": result.get("run_id"),
        "review": result.get("review"),
        "decision": result.get("decision"),
    }


@router.put("/interview-questions/{question_id}/answer")
def save_answer(question_id: int, payload: AnswerSave, db: Session = Depends(get_db)):
    question = db.get(InterviewQuestion, question_id)
    if question is None:
        raise NotFoundError(f"题目 {question_id} 不存在")
    answer = db.query(InterviewAnswer).filter(InterviewAnswer.question_id == question_id).first()
    if answer is None:
        answer = InterviewAnswer(question_id=question_id, content=payload.content)
        db.add(answer)
    else:
        answer.content = payload.content
    db.commit()
    return {"question_id": question_id, "message": "已保存"}


@router.post("/interview-sessions/{session_id}/review")
def review_session(session_id: int, db: Session = Depends(get_db)):
    """AI 复盘（走 reviewer 评审管道，生成/评估分离）。"""
    session = _get_session(db, session_id)
    from app.models.agent import Agent
    from app.models.resume import ResumeVersion

    agent = db.query(Agent).filter(Agent.name == "reviewer").first()
    if agent is None:
        raise NotFoundError("内置 Agent reviewer 不存在")

    qa_pairs = []
    for q in session.questions:
        answer = db.query(InterviewAnswer).filter(InterviewAnswer.question_id == q.id).first()
        qa_pairs.append({"question": q.question, "answer": answer.content if answer else ""})
    resume_text = ""
    if session.resume_version_id:
        version = db.get(ResumeVersion, session.resume_version_id)
        if version:
            resume_text = version.plain_text

    def executor(ctx, guard):
        result = run_review_answers(qa_pairs, resume_text, ctx, guard)
        return {"output": result.model_dump()}

    runtime = AgentRuntime(agent, db)
    result = runtime.run(
        task_description=f"面试复盘 session:{session_id}",
        user_input="请对本次面试作答进行复盘",
        context={"session_id": session_id},
        executor=executor,
        source_text=resume_text,
        with_quality_gate=False,  # 评审 Agent 不再被二次评审
    )
    report = InterviewReviewReport.model_validate(result["output"])
    review = InterviewReview(
        session_id=session_id,
        report=report.model_dump(),
        gate=result.get("gate", {}),
    )
    db.add(review)
    session.status = "completed"
    db.commit()
    return {"id": review.id, "report": review.model_dump(), "run_id": result.get("run_id")}


@router.post("/interview-sessions/{session_id}/coach")
def coach_turn(session_id: int, payload: CoachTurn, db: Session = Depends(get_db)):
    """模拟面试对话轮（走 interview-coach Agent，带记忆）。"""
    session = _get_session(db, session_id)
    from app.models.agent import Agent
    from app.models.resume import ResumeVersion

    agent = db.query(Agent).filter(Agent.name == "interview-coach").first()
    if agent is None:
        raise NotFoundError("内置 Agent interview-coach 不存在")

    resume_text = ""
    if session.resume_version_id:
        version = db.get(ResumeVersion, session.resume_version_id)
        if version:
            resume_text = version.plain_text

    memory = MemoryService(f"interview-coach:{session_id}")
    system_prompt = (
        constitution_text() + "\n\n" + COACH_SYSTEM_PROMPT + "\n\n候选人简历背景：\n" + resume_text[:3000]
    )
    # 经 build_llm_messages 注入滚动摘要（若已生成），并按窗口裁剪
    llm_messages = memory.build_llm_messages(db, system_prompt, payload.message)
    # build_llm_messages 返回 [system, (摘要), 历史窗口, 当前输入]；
    # coach 内部会自拼 system，故去掉首条 system，仅把 [摘要, 历史, 当前输入] 作为对话历史
    conversation_messages = llm_messages[1:]

    def executor(ctx, guard):
        output = run_coach_turn(conversation_messages, resume_text, ctx, guard)
        return {"output": output}

    runtime = AgentRuntime(agent, db)
    result = runtime.run(
        task_description=f"模拟面试 session:{session_id}",
        user_input=payload.message,
        context={"session_id": session_id},
        executor=executor,
        source_text=resume_text,
        with_quality_gate=False,  # 对话场景不做二次评审，避免延迟
    )
    memory.add_message(db, "user", payload.message)
    memory.add_message(db, "assistant", result["output"])
    # 按完整历史触发滚动摘要（仅在超阈值时生成），供后续轮次注入
    memory.maybe_summarize(db, memory.assemble(db, ""))
    return {"reply": result["output"], "run_id": result.get("run_id")}
