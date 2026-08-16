"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { JDItem, JDMatchResult, ResumeItem } from "@/types";

export default function JdMatchPage() {
  const [jds, setJds] = useState<JDItem[]>([]);
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);

  const [selectedJdId, setSelectedJdId] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [matching, setMatching] = useState(false);
  const [result, setResult] = useState<{ result: JDMatchResult; run_id?: string; review?: unknown; decision?: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.listJds(), api.listResumes()])
      .then(([jdList, resList]) => {
        setJds(jdList);
        setResumes(resList);
        if (jdList.length > 0) setSelectedJdId((prev) => prev ?? jdList[0].id);
      })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const createJd = async () => {
    if (!company.trim() || !title.trim() || content.trim().length < 10) {
      alert("请填写公司、职位与完整 JD 内容（至少 10 字）");
      return;
    }
    setCreating(true);
    try {
      await api.createJd({ company: company.trim(), title: title.trim(), content });
      setCompany("");
      setTitle("");
      setContent("");
      setShowCreate(false);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const removeJd = async (id: number) => {
    if (!confirm("确认删除该 JD？")) return;
    try {
      await api.deleteJd(id);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  };

  const runMatch = async () => {
    if (!selectedJdId || !selectedVersion) {
      alert("请选择 JD 与简历版本");
      return;
    }
    setMatching(true);
    setResult(null);
    try {
      const r = await api.runMatch(selectedJdId, Number(selectedVersion));
      setResult(r);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setMatching(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">JD 匹配</h1>
          <p className="text-sm text-slate-500 mt-1">逐条要求 ↔ 简历证据匹配诊断、措辞重排建议，AI 不虚构经历</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>＋ 新建 JD</button>
      </header>

      {showCreate && (
        <div className="card p-5 mb-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="input" placeholder="公司名称" value={company} onChange={(e) => setCompany(e.target.value)} />
            <input className="input" placeholder="职位名称" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <textarea
            className="input min-h-[160px] font-mono text-xs leading-5"
            placeholder="粘贴完整 JD 内容（职位描述、任职要求、职责）"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn-primary" onClick={createJd} disabled={creating}>保存 JD</button>
            <button className="btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 py-16 text-center">加载中…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左：JD 列表 */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-600">职位描述</h3>
            {jds.length === 0 && <div className="card p-6 text-center text-sm text-slate-400">暂无 JD</div>}
            {jds.map((jd) => (
              <div
                key={jd.id}
                onClick={() => {
                  setSelectedJdId(jd.id);
                  setResult(null);
                }}
                className={`card p-4 cursor-pointer transition-colors ${
                  selectedJdId === jd.id ? "ring-2 ring-brand-500" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-slate-800 text-sm">{jd.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{jd.company}</div>
                  </div>
                  <button
                    className="text-xs text-red-400 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeJd(jd.id);
                    }}
                  >
                    删除
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-2 line-clamp-2 whitespace-pre-line">{jd.content}</p>
                <div className="text-[10px] text-slate-300 mt-1.5">{new Date(jd.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>

          {/* 右：匹配区 */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card p-5">
              <h3 className="font-medium text-slate-700 mb-3">发起匹配</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="label">简历版本</label>
                  <select
                    className="input"
                    value={selectedVersion}
                    onChange={(e) => {
                      setSelectedVersion(e.target.value);
                      setResult(null);
                    }}
                  >
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
                  <label className="label">目标 JD</label>
                  <select className="input" value={selectedJdId ?? ""} onChange={(e) => { setSelectedJdId(Number(e.target.value)); setResult(null); }}>
                    {jds.map((jd) => (
                      <option key={jd.id} value={jd.id}>
                        {jd.company} - {jd.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="btn-primary" onClick={runMatch} disabled={matching || !selectedJdId || !selectedVersion}>
                {matching ? "匹配诊断中（jd-matcher Agent）…" : "开始匹配诊断"}
              </button>
            </div>

            {matching && (
              <div className="card p-8 text-center text-sm text-slate-500">
                <div className="animate-pulse text-2xl mb-2">◈</div>
                正在执行 jd-matcher Agent：证据差距诊断 → 措辞重排 → 质量门禁…
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <div className="card p-5 flex items-center gap-5">
                  <div className="w-20 h-20 rounded-full grid place-items-center border-4 border-brand-500 text-brand-600 text-xl font-semibold">
                    {result.result.overall_score}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-700">综合匹配度</div>
                    <p className="text-xs text-slate-500 mt-1 leading-5">{result.result.summary}</p>
                    {result.decision && (
                      <div className="mt-1.5 text-xs text-slate-400">
                        质量门禁：<span className="badge badge-blue">{result.decision}</span>
                        {result.run_id && <span className="ml-2">run: {result.run_id.slice(0, 8)}</span>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="card p-5">
                  <h4 className="font-medium text-slate-700 mb-3">逐条要求匹配诊断</h4>
                  <div className="space-y-3">
                    {result.result.per_requirement.map((req, i) => (
                      <div key={i} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center gap-2">
                          <span className={`badge ${req.score >= 7 ? "badge-green" : req.score >= 4 ? "badge-amber" : "badge-red"}`}>
                            {req.score} 分
                          </span>
                          <span className="text-sm font-medium text-slate-700">{req.requirement}</span>
                        </div>
                        {req.evidence && (
                          <div className="text-xs text-emerald-700 mt-1.5">简历证据：{req.evidence}</div>
                        )}
                        {req.gap && <div className="text-xs text-red-600 mt-1">差距：{req.gap}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="card p-5">
                    <h4 className="font-medium text-slate-700 mb-3">内容重排建议</h4>
                    <ul className="space-y-1.5">
                      {result.result.reorder.map((r, i) => (
                        <li key={i} className="text-xs text-slate-600 leading-5 flex gap-2">
                          <span className="text-brand-500 shrink-0">→</span>{r}
                        </li>
                      ))}
                      {result.result.reorder.length === 0 && <li className="text-xs text-slate-400">无</li>}
                    </ul>
                  </div>
                  <div className="card p-5">
                    <h4 className="font-medium text-slate-700 mb-3">措辞优化建议</h4>
                    <ul className="space-y-1.5">
                      {result.result.wording.map((w, i) => (
                        <li key={i} className="text-xs text-slate-600 leading-5 flex gap-2">
                          <span className="text-brand-500 shrink-0">✎</span>{w}
                        </li>
                      ))}
                      {result.result.wording.length === 0 && <li className="text-xs text-slate-400">无</li>}
                    </ul>
                  </div>
                </div>

                <div className="card p-5">
                  <h4 className="font-medium text-slate-700 mb-2">已有优势</h4>
                  <ul className="list-disc list-inside text-xs text-emerald-700 space-y-1">
                    {result.result.matched_strengths.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                  {result.result.missing_facts.length > 0 && (
                    <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
                      <div className="text-xs font-medium text-amber-800 mb-1">缺失事实（AI 未补全，请在简历中补录）</div>
                      <ul className="list-disc list-inside text-xs text-amber-700 space-y-0.5">
                        {result.result.missing_facts.map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
