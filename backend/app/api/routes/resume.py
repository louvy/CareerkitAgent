"""简历 API：CRUD + AI 诊断/优化（走 Harness 管道）。"""

import copy
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.business.resume import run_diagnosis, run_optimize
from app.api.routes.pipeline import run_harness_pipeline
from app.core.deps import get_db
from app.core.exceptions import NotFoundError
from app.models.resume import Resume, ResumeVersion
from app.schemas.resume import DiagnosisIssue, OptimizationSuggestions, ResumeDiagnosis
from app.services.export import resume_to_docx_bytes
from app.services.storage import download_bytes, upload_bytes

router = APIRouter(prefix="/api", tags=["resume"])

# 允许代理下载的对象名前缀（防止 MinIO 任意对象越权读取）
ALLOWED_OBJECT_PREFIXES = ("exports/", "knowledge/", "resumes/")


class ResumeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    label: str = Field(default="主版本")
    content: dict = Field(default_factory=dict)


class VersionCreate(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    version_type: str = Field(default="general")


class VersionUpdate(BaseModel):
    label: Optional[str] = None
    content: Optional[dict] = None
    notes: Optional[str] = None


class DiagnoseRequest(BaseModel):
    pass


class OptimizeRequest(BaseModel):
    selected_issues: list[dict] = Field(default_factory=list)
    directions: list[str] = Field(default_factory=list)
    extra_instruction: str = ""


class ApplySuggestionsRequest(BaseModel):
    """应用用户确认后的优化建议，生成新版本（原版保留）。"""

    label: str = Field(default="AI 优化版")
    version_type: str = Field(default="general")
    # 用户确认后的最终分段内容：{section_title: 新内容}
    sections: dict = Field(description="按段落标题给出的确认后内容")


def _get_version(db: Session, version_id: int) -> ResumeVersion:
    version = db.get(ResumeVersion, version_id)
    if version is None:
        raise NotFoundError(f"简历版本 {version_id} 不存在")
    return version


@router.get("/resumes")
def list_resumes(db: Session = Depends(get_db)):
    resumes = db.query(Resume).order_by(Resume.updated_at.desc()).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "updated_at": r.updated_at,
            "versions": [
                {"id": v.id, "label": v.label, "version_type": v.version_type, "created_at": v.created_at}
                for v in r.versions
            ],
        }
        for r in resumes
    ]


@router.post("/resumes")
def create_resume(payload: ResumeCreate, db: Session = Depends(get_db)):
    resume = Resume(name=payload.name)
    resume.versions.append(
        ResumeVersion(label=payload.label, version_type="general", content=payload.content)
    )
    db.add(resume)
    db.commit()
    return {"id": resume.id, "name": resume.name}


@router.get("/resumes/{resume_id}")
def get_resume(resume_id: int, db: Session = Depends(get_db)):
    resume = db.get(Resume, resume_id)
    if resume is None:
        raise NotFoundError(f"简历 {resume_id} 不存在")
    return {
        "id": resume.id,
        "name": resume.name,
        "versions": [
            {
                "id": v.id,
                "label": v.label,
                "version_type": v.version_type,
                "content": v.content,
                "notes": v.notes,
                "created_at": v.created_at,
            }
            for v in resume.versions
        ],
    }


@router.delete("/resumes/{resume_id}")
def delete_resume(resume_id: int, db: Session = Depends(get_db)):
    resume = db.get(Resume, resume_id)
    if resume is None:
        raise NotFoundError(f"简历 {resume_id} 不存在")
    db.delete(resume)
    db.commit()
    return {"message": "已删除"}


@router.post("/resumes/{resume_id}/versions")
def create_version(resume_id: int, payload: VersionCreate, db: Session = Depends(get_db)):
    resume = db.get(Resume, resume_id)
    if resume is None:
        raise NotFoundError(f"简历 {resume_id} 不存在")
    source = resume.versions[-1] if resume.versions else None
    version = ResumeVersion(
        resume_id=resume_id,
        label=payload.label,
        version_type=payload.version_type,
        content=copy.deepcopy(source.content) if source else {},
    )
    db.add(version)
    db.commit()
    return {"id": version.id, "label": version.label}


@router.put("/resume-versions/{version_id}")
def update_version(version_id: int, payload: VersionUpdate, db: Session = Depends(get_db)):
    version = _get_version(db, version_id)
    if payload.label is not None:
        version.label = payload.label
    if payload.content is not None:
        version.content = payload.content
    if payload.notes is not None:
        version.notes = payload.notes
    db.commit()
    return {"id": version.id, "message": "已保存"}


@router.delete("/resume-versions/{version_id}")
def delete_version(version_id: int, db: Session = Depends(get_db)):
    version = _get_version(db, version_id)
    db.delete(version)
    db.commit()
    return {"message": "已删除"}


@router.get("/resume-versions/{version_id}/export")
def export_version(version_id: int, db: Session = Depends(get_db)):
    """导出 Word 到 MinIO，返回对象名与下载地址（经后端代理）。"""
    version = _get_version(db, version_id)
    data = resume_to_docx_bytes(version)
    obj = upload_bytes(
        "exports",
        f"{version.label}.docx",
        data,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    return {"object": obj, "url": f"/api/objects/{quote(obj)}/download"}


@router.get("/objects/{object_name:path}/download")
def download_export(object_name: str):
    """下载导出的对象文件（容器内 MinIO 地址对浏览器不可达，统一经后端代理）。"""
    # 路径穿越与越权防护：拒绝 `..`、绝对路径、反斜杠，且限定在已知业务前缀内
    if not object_name or ".." in object_name or object_name.startswith("/") or "\\" in object_name:
        raise NotFoundError("非法的对象名")
    if not object_name.startswith(ALLOWED_OBJECT_PREFIXES):
        raise NotFoundError("非法的对象名")
    data = download_bytes(object_name)
    if data is None:
        raise NotFoundError("导出文件不存在或已过期")
    filename = object_name.rsplit("-", 1)[-1] if "-" in object_name else object_name.split("/")[-1]
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.post("/resume-versions/{version_id}/diagnose")
def diagnose(version_id: int, _: DiagnoseRequest, db: Session = Depends(get_db)):
    """AI 诊断（只读）：走 resume-analyzer Agent 的 Harness 管道。"""
    version = _get_version(db, version_id)

    def executor(ctx, guard):
        result = run_diagnosis(version_id, ctx, guard)
        return {"output": result.model_dump()}

    result = run_harness_pipeline(
        db,
        "resume-analyzer",
        task_description=f"简历诊断 resume_version:{version_id}",
        user_input="请诊断这份简历",
        context={"version_id": version_id},
        executor=executor,
        source_text=version.plain_text,
    )
    diagnosis = ResumeDiagnosis.model_validate(result["output"])
    return {"diagnosis": diagnosis.model_dump(), "run_id": result.get("run_id"), "review": result.get("review"), "decision": result.get("decision")}


@router.post("/resume-versions/{version_id}/optimize")
def optimize(version_id: int, payload: OptimizeRequest, db: Session = Depends(get_db)):
    """AI 优化建议（逐条可确认）：走 resume-optimizer Agent 的 Harness 管道。"""
    version = _get_version(db, version_id)

    def executor(ctx, guard):
        result = run_optimize(
            version_id, payload.selected_issues, payload.directions, payload.extra_instruction, ctx, guard
        )
        return {"output": result.model_dump()}

    result = run_harness_pipeline(
        db,
        "resume-optimizer",
        task_description=f"简历优化 resume_version:{version_id}",
        user_input="请生成优化建议",
        context={"version_id": version_id, "directions": payload.directions},
        executor=executor,
        source_text=version.plain_text,
    )
    suggestions = OptimizationSuggestions.model_validate(result["output"])
    return {"suggestions": suggestions.model_dump(), "run_id": result.get("run_id"), "review": result.get("review"), "decision": result.get("decision")}


@router.post("/resume-versions/{version_id}/apply-suggestions")
def apply_suggestions(version_id: int, payload: ApplySuggestionsRequest, db: Session = Depends(get_db)):
    """用户确认后的建议写入新版本（原版保留，宪法 CHANGE_USER_CONFIRM）。"""
    version = _get_version(db, version_id)
    new_content = copy.deepcopy(version.content)
    new_content["sections"] = []
    for title, body in payload.sections.items():
        new_content["sections"].append({"title": title, "items": body})
    new_version = ResumeVersion(
        resume_id=version.resume_id,
        label=payload.label,
        version_type=payload.version_type,
        content=new_content,
        notes=f"基于版本 {version_id} 的 AI 优化结果（用户确认后生成）",
    )
    db.add(new_version)
    db.commit()
    return {"id": new_version.id, "label": new_version.label}
