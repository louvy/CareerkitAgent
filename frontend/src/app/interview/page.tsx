"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { InterviewSessionItem, JDItem, ResumeItem } from "@/types";

const STATUS_LABEL: Record<string, string> = { active: "进行中", completed: "已复盘" };

export default function InterviewListPage() {
  const [sessions, setSessions] = useState<InterviewSessionItem[]>([]);
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [jds, setJds] = useState<JDItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [resumeVersionId, setResumeVersionId] = useState("");
  const [jdId, setJdId] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.listSessions(), api.listResumes(), api.listJds()])
      .then(([s, r, j]) => {
        setSessions(s);
        setResumes(r);
        setJds(j);
      })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const createSession = async () => {
    if (!title.trim() || !resumeVersionId) {
      alert("请填写会话标题并选择简历版本");
      return;
    }
    setCreating(true);
    try {
      const r = await api.createSession({
        title: title.trim(),
        resume_version_id: Number(resumeVersionId),
        jd_id: jdId ? Number(jdId) : null,
      });
      window.location.href = `/interview/${r.id}`;
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">面试刷题</h1>
          <p className="text-sm text-slate-500 mt-1">基于简历 + JD 生成针对性题目，作答后由评审 Agent 独立复盘</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>＋ 新面试会话</button>
      </header>

      {showCreate && (
        <div className="card p-5 mb-6 space-y-3">
          <input
            className="input"
            placeholder="会话标题，如：字节后端一面模拟"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">简历版本（必选）</label>
              <select className="input" value={resumeVersionId} onChange={(e) => setResumeVersionId(e.target.value)}>
                <option value="">选择简历版本…</option>
                {resumes.map((r) =>
                  r.versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {r.name} / {v.label}
                    </option>
                  )),
                )}
              </select>
            </div>
            <div>
              <label className="label">目标 JD（可选）</label>
              <select className="input" value={jdId} onChange={(e) => setJdId(e.target.value)}>
                <option value="">不绑定 JD</option>
                {jds.map((jd) => (
                  <option key={jd.id} value={jd.id}>
                    {jd.company} - {jd.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={createSession} disabled={creating}>
              {creating ? "interview-generator 出题中…" : "创建并出题"}
            </button>
            <button className="btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 py-16 text-center">加载中…</div>
      ) : sessions.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <div className="text-3xl mb-3">◉</div>
          <p>还没有面试会话，点击右上角创建</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <Link key={s.id} href={`/interview/${s.id}`} className="card p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800">{s.title}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {s.question_count} 题 · {new Date(s.created_at).toLocaleString()}
                </div>
              </div>
              <span className={`badge ${s.status === "completed" ? "badge-green" : "badge-blue"}`}>
                {STATUS_LABEL[s.status] || s.status}
              </span>
              <span className="text-slate-300">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
