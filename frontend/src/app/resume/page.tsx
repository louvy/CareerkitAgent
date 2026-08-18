"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ResumeItem } from "@/types";

export default function ResumeListPage() {
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listResumes()
      .then(setResumes)
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const createResume = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const r = await api.createResume({ name: name.trim() });
      setName("");
      setShowCreate(false);
      window.location.href = `/resume/${r.id}`;
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const removeResume = async (id: number) => {
    if (!confirm("确认删除该简历及其全部版本？")) return;
    try {
      await api.deleteResume(id);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  };

  const importResumeFile = async (files: FileList | null) => {
    const file = files && files[0];
    if (!file) return;
    setImporting(true);
    try {
      const r = await api.importResume(file);
      window.location.href = `/resume/${r.id}`;
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">简历库</h1>
          <p className="text-sm text-slate-500 mt-1">结构化简历与多版本管理，AI 诊断/优化基于版本快照，原版始终保留</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            ＋ 新建简历
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? "导入中…" : "导入简历"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e) => importResumeFile(e.target.files)}
          />
        </div>
      </header>

      {showCreate && (
        <div className="card p-5 mb-6">
          <div className="flex gap-3">
            <input
              className="input"
              placeholder="简历名称，如：张三 - 后端工程师"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createResume()}
              autoFocus
            />
            <button className="btn-primary shrink-0" onClick={createResume} disabled={creating || !name.trim()}>
              {creating ? "创建中…" : "创建"}
            </button>
            <button className="btn-secondary shrink-0" onClick={() => setShowCreate(false)}>
              取消
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 py-16 text-center">加载中…</div>
      ) : resumes.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <div className="text-3xl mb-3">▤</div>
          <p>还没有简历，点击右上角「新建简历」开始</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {resumes.map((r) => (
            <div key={r.id} className="card p-5 flex flex-col gap-3">
              <Link href={`/resume/${r.id}`} className="block">
                <div className="font-medium text-slate-800 hover:text-brand-600">{r.name}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {r.versions.length} 个版本 · 更新于 {new Date(r.updated_at).toLocaleDateString()}
                </div>
              </Link>
              <div className="flex flex-wrap gap-1.5">
                {r.versions.slice(0, 5).map((v) => (
                  <span key={v.id} className="badge badge-slate">{v.label}</span>
                ))}
                {r.versions.length > 5 && <span className="badge badge-slate">+{r.versions.length - 5}</span>}
              </div>
              <div className="flex gap-2 mt-auto">
                <Link href={`/resume/${r.id}`} className="btn-secondary text-xs flex-1 justify-center">
                  打开编辑
                </Link>
                <button className="btn-danger text-xs" onClick={() => removeResume(r.id)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
