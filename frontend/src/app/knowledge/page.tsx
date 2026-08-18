"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ChunkPreviewResult, KnowledgeBaseItem, LLMModelItem } from "@/types";

interface KbForm {
  name: string;
  description: string;
  chunk_strategy: string;
  chunk_size: string;
  chunk_overlap: string;
  embedding_model_id: number | null;
}

export default function KnowledgePage() {
  const [kbs, setKbs] = useState<KnowledgeBaseItem[]>([]);
  const [embModels, setEmbModels] = useState<LLMModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<KnowledgeBaseItem | "new" | null>(null);
  const [form, setForm] = useState<KbForm>({
    name: "",
    description: "",
    chunk_strategy: "auto",
    chunk_size: "800",
    chunk_overlap: "100",
    embedding_model_id: null,
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [importing, setImporting] = useState<number | null>(null);
  const [urlInputs, setUrlInputs] = useState<Record<number, string>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);

  // 切块预览
  const [previewText, setPreviewText] = useState("");
  const [preview, setPreview] = useState<ChunkPreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.listKbs(), api.listModels("embedding")])
      .then(([kbList, em]) => {
        setKbs(kbList);
        setEmbModels(em);
      })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const embName = (id: number | null) => {
    if (id == null) return "默认";
    return embModels.find((m) => m.id === id)?.name || `#${id}`;
  };

  const openNew = () => {
    setEditing("new");
    setForm({
      name: "",
      description: "",
      chunk_strategy: "auto",
      chunk_size: "800",
      chunk_overlap: "100",
      embedding_model_id: null,
    });
  };

  const openEdit = (kb: KnowledgeBaseItem) => {
    setEditing(kb);
    setForm({
      name: kb.name,
      description: kb.description,
      chunk_strategy: kb.chunk_strategy,
      chunk_size: String(kb.chunk_size),
      chunk_overlap: String(kb.chunk_overlap),
      embedding_model_id: kb.embedding_model_id,
    });
  };

  const save = async () => {
    if (!form.name.trim()) {
      alert("请填写知识库名称");
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description,
      chunk_strategy: form.chunk_strategy,
      chunk_size: parseInt(form.chunk_size, 10) || 800,
      chunk_overlap: parseInt(form.chunk_overlap, 10) || 0,
      embedding_model_id: form.embedding_model_id,
    };
    setBusy(true);
    try {
      if (editing === "new") await api.createKb(payload);
      else if (editing) await api.updateKb(editing.id, payload);
      setEditing(null);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (kb: KnowledgeBaseItem) => {
    if (!confirm(`确认删除知识库「${kb.name}」及其全部向量分片？`)) return;
    try {
      await api.deleteKb(kb.id);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  };

  const upload = async (kbId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(kbId);
    try {
      const r = await api.uploadDocs(kbId, Array.from(files));
      const summary = (r.results || [])
        .map((x) => `${(x as { file: string; chunks: number }).file} → ${(x as { file: string; chunks: number }).chunks} 分片`)
        .join("；");
      alert(`上传完成：${summary || "无内容"}`);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const importUrl = async (kbId: number, url: string) => {
    const u = url.trim();
    if (!u) return;
    setImporting(kbId);
    try {
      const r = await api.importUrl(kbId, u);
      alert(`网页导入完成：${r.chunks} 分片`);
      setUrlInputs((m) => ({ ...m, [kbId]: "" }));
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setImporting(null);
    }
  };

  const runPreview = async () => {
    if (!previewText.trim()) return;
    setPreviewing(true);
    setPreview(null);
    try {
      setPreview(
        await api.previewChunks({
          text: previewText,
          chunk_strategy: form.chunk_strategy,
          chunk_size: parseInt(form.chunk_size, 10) || 800,
          chunk_overlap: parseInt(form.chunk_overlap, 10) || 0,
        }),
      );
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">知识库管理</h1>
        <p className="text-sm text-slate-500 mt-1">
          文档上传 → 按策略切块（auto 段落感知 / fixed 固定窗口）→ 选择 Embedding 模型向量化入库，支持混合检索
        </p>
      </header>

      <div className="flex items-center gap-2 mb-6">
        <button className="btn-primary" onClick={openNew} disabled={editing !== null}>
          + 新建知识库
        </button>
        <span className="text-xs text-slate-400">支持 .txt / .md / .pdf，也可粘贴网页 URL 导入；上传后按知识库配置自动切块向量化</span>
      </div>

      {/* 新建 / 编辑表单 */}
      {editing && (
        <div className="card p-5 mb-6 space-y-3">
          <h3 className="font-medium text-slate-700">
            {editing === "new" ? "新建知识库" : `编辑知识库「${editing.name}」`}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">名称</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">描述</label>
              <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">切块策略</label>
              <select
                className="input"
                value={form.chunk_strategy}
                onChange={(e) => setForm({ ...form, chunk_strategy: e.target.value })}
              >
                <option value="auto">auto（段落感知）</option>
                <option value="fixed">fixed（固定窗口）</option>
              </select>
            </div>
            <div>
              <label className="label">切块大小</label>
              <input type="number" min={100} max={4000} className="input" value={form.chunk_size} onChange={(e) => setForm({ ...form, chunk_size: e.target.value })} />
            </div>
            <div>
              <label className="label">重叠长度</label>
              <input type="number" min={0} max={500} className="input" value={form.chunk_overlap} onChange={(e) => setForm({ ...form, chunk_overlap: e.target.value })} />
            </div>
            <div>
              <label className="label">Embedding 模型</label>
              <select
                className="input"
                value={form.embedding_model_id ?? ""}
                onChange={(e) => setForm({ ...form, embedding_model_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">默认（全局）</option>
                {embModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}（{m.model}）
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save} disabled={busy}>
              {busy ? "保存中…" : "保存"}
            </button>
            <button className="btn-secondary" onClick={() => setEditing(null)} disabled={busy}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* 切块预览 */}
      <div className="card p-5 mb-6">
        <h3 className="font-medium text-slate-700 mb-3">切块预览（不落库）</h3>
        <textarea
          className="input min-h-[100px] text-xs leading-5 font-mono"
          placeholder="粘贴一段文本，按当前策略预览切块效果…"
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
        />
        <div className="flex items-center gap-3 mt-3">
          <button className="btn-secondary text-xs" onClick={runPreview} disabled={previewing || !previewText.trim()}>
            {previewing ? "预览中…" : "预览切块"}
          </button>
          {preview && (
            <span className="text-xs text-slate-500">
              {preview.count} 块 · {preview.total_chars} 字符 · {preview.strategy} / size={preview.chunk_size} / overlap={preview.chunk_overlap}
            </span>
          )}
        </div>
        {preview && (
          <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
            {preview.chunks.map((c, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="text-[10px] text-slate-400 mb-1 font-mono">
                  chunk #{i + 1} · {c.length} 字符
                </div>
                <div className="text-xs text-slate-600 leading-5 whitespace-pre-wrap">{c}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 知识库列表 */}
      {loading ? (
        <div className="text-sm text-slate-500 py-10 text-center">加载中…</div>
      ) : kbs.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-400">暂无知识库，点击上方「新建知识库」创建</div>
      ) : (
        <div className="space-y-3">
          {kbs.map((kb) => (
            <div key={kb.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{kb.name}</span>
                    <span className="badge badge-blue">{kb.chunk_strategy}</span>
                    <span className="badge badge-slate">{kb.chunk_count} 分片</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{kb.description || "无描述"}</p>
                  <div className="text-[11px] text-slate-400 mt-1.5">
                    size={kb.chunk_size} · overlap={kb.chunk_overlap} · embedding：{embName(kb.embedding_model_id)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept=".txt,.md,.pdf"
                    className="hidden"
                    onChange={(e) => upload(kb.id, e.target.files)}
                  />
                  <button className="btn-secondary text-xs" onClick={() => fileRef.current?.click()} disabled={uploading === kb.id}>
                    {uploading === kb.id ? "向量化中…" : "上传文档"}
                  </button>
                  <button className="btn-secondary text-xs" onClick={() => openEdit(kb)}>
                    编辑配置
                  </button>
                  <button className="btn-danger text-xs" onClick={() => remove(kb)}>
                    删除
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="url"
                  placeholder="粘贴网页 URL 导入（如 https://...）"
                  className="input text-xs"
                  value={urlInputs[kb.id] ?? ""}
                  onChange={(e) => setUrlInputs((m) => ({ ...m, [kb.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && importUrl(kb.id, urlInputs[kb.id] ?? "")}
                />
                <button
                  className="btn-secondary text-xs shrink-0"
                  disabled={importing === kb.id || !(urlInputs[kb.id] || "").trim()}
                  onClick={() => importUrl(kb.id, urlInputs[kb.id] ?? "")}
                >
                  {importing === kb.id ? "抓取中…" : "导入网页"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
