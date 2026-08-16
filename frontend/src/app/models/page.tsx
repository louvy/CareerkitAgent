"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { LLMModelItem, ModelTestResult } from "@/types";

const CATEGORY_LABEL: Record<string, string> = { chat: "Chat 对话", embedding: "Embedding 向量" };

interface ModelForm {
  name: string;
  model: string;
  base_url: string;
  api_key: string;
  description: string;
  is_default: boolean;
}

const EMPTY_FORM: ModelForm = { name: "", model: "", base_url: "", api_key: "", description: "", is_default: false };

export default function ModelsPage() {
  const [category, setCategory] = useState<"chat" | "embedding">("chat");
  const [models, setModels] = useState<LLMModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LLMModelItem | "new" | null>(null);
  const [form, setForm] = useState<ModelForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, ModelTestResult>>({});

  const load = useCallback(() => {
    setLoading(true);
    api
      .listModels(category)
      .then(setModels)
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, [category]);

  useEffect(load, [load]);

  const openNew = () => {
    setEditing("new");
    setForm(EMPTY_FORM);
  };

  const openEdit = (m: LLMModelItem) => {
    setEditing(m);
    setForm({
      name: m.name,
      model: m.model,
      base_url: m.base_url,
      api_key: "",
      description: m.description,
      is_default: m.is_default,
    });
  };

  const save = async () => {
    if (!form.name.trim() || !form.model.trim()) {
      alert("请填写名称与模型名");
      return;
    }
    setBusy(true);
    try {
      if (editing === "new") {
        await api.createModel({ ...form, category, api_key: form.api_key });
      } else if (editing) {
        await api.updateModel(editing.id, { ...form, category });
      }
      setEditing(null);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: LLMModelItem) => {
    if (!confirm(`确认删除模型「${m.name}」？`)) return;
    try {
      await api.deleteModel(m.id);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  };

  const setDefault = async (m: LLMModelItem) => {
    try {
      await api.setDefaultModel(m.id);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  };

  const test = async (m: LLMModelItem) => {
    setTesting(m.id);
    setTestResult((prev) => ({ ...prev, [m.id]: undefined as unknown as ModelTestResult }));
    try {
      const r = await api.testModel(m.id);
      setTestResult((prev) => ({ ...prev, [m.id]: r }));
    } catch (e: unknown) {
      setTestResult((prev) => ({ ...prev, [m.id]: { ok: false, error: (e as Error).message } }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">模型管理</h1>
        <p className="text-sm text-slate-500 mt-1">
          Chat 类型可供 Agent 选择，Embedding 类型供知识库向量化；每分类仅一个默认模型（API Key 加密存储）
        </p>
      </header>

      {/* 分类 Tab */}
      <div className="flex items-center gap-2 mb-6">
        {(["chat", "embedding"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              category === c ? "bg-brand-600 text-white" : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
        <div className="flex-1" />
        <button className="btn-primary" onClick={openNew} disabled={editing !== null}>
          + 新增模型
        </button>
      </div>

      {/* 新增 / 编辑表单 */}
      {editing && (
        <div className="card p-5 mb-6 space-y-3">
          <h3 className="font-medium text-slate-700">{editing === "new" ? "新增模型" : `编辑模型「${editing.name}」`}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">名称（展示用）</label>
              <input className="input" placeholder="如：GPT-4o Mini" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">模型名（供应商）</label>
              <input className="input" placeholder="如：gpt-4o-mini" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Base URL（OpenAI 兼容，可留空用官方）</label>
              <input className="input" placeholder="https://api.openai.com/v1" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
            </div>
            <div>
              <label className="label">
                API Key {editing !== "new" && editing.has_api_key && <span className="text-slate-300">（留空保持原 Key）</span>}
              </label>
              <input className="input" type="password" placeholder="sk-..." value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">描述</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
            设为该分类默认模型
          </label>
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

      {/* 列表 */}
      {loading ? (
        <div className="text-sm text-slate-500 py-16 text-center">加载中…</div>
      ) : models.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-400">
          暂无 {CATEGORY_LABEL[category]} 模型，点击右上角「新增模型」添加
        </div>
      ) : (
        <div className="space-y-3">
          {models.map((m) => {
            const tr = testResult[m.id];
            return (
              <div key={m.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{m.name}</span>
                      <span className="badge badge-blue">{CATEGORY_LABEL[m.category]}</span>
                      {m.is_default && <span className="badge badge-green">默认</span>}
                      {!m.has_api_key && <span className="badge badge-amber">未配置 Key</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-1.5 font-mono">
                      {m.model}
                      {m.base_url && <span className="text-slate-300"> · {m.base_url}</span>}
                    </div>
                    {m.description && <p className="text-xs text-slate-500 mt-1">{m.description}</p>}
                    {m.api_key_masked && <div className="text-[11px] text-slate-300 mt-1">Key：{m.api_key_masked}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button className="btn-secondary text-xs" onClick={() => test(m)} disabled={testing === m.id}>
                      {testing === m.id ? "测试中…" : "连接测试"}
                    </button>
                    {!m.is_default && (
                      <button className="btn-secondary text-xs" onClick={() => setDefault(m)}>
                        设为默认
                      </button>
                    )}
                    <button className="btn-secondary text-xs" onClick={() => openEdit(m)}>
                      编辑
                    </button>
                    <button className="btn-danger text-xs" onClick={() => remove(m)} disabled={m.is_default}>
                      删除
                    </button>
                  </div>
                </div>
                {tr && (
                  <div
                    className={`mt-3 rounded-lg p-3 text-sm ${tr.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}
                  >
                    {tr.ok ? `✓ 连接成功：${tr.reply}` : `✗ 连接失败：${tr.error}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
