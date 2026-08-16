"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ToolItem } from "@/types";

const CATEGORY_LABEL: Record<string, string> = { http: "HTTP 工具", mcp: "MCP 工具" };
const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

interface ToolForm {
  name: string;
  category: "http" | "mcp";
  description: string;
  method: string;
  url: string;
  headers: string;
  command: string;
  args: string;
  env: string;
}

const EMPTY_FORM: ToolForm = {
  name: "",
  category: "http",
  description: "",
  method: "GET",
  url: "",
  headers: "{}",
  command: "",
  args: "[]",
  env: "{}",
};

function parseJson(value: string, fallback: unknown, field: string): Record<string, unknown> | unknown[] {
  try {
    const parsed = JSON.parse(value || "null");
    if (parsed === null) return fallback as Record<string, unknown> | unknown[];
    return parsed;
  } catch {
    throw new Error(`${field} 不是合法的 JSON`);
  }
}

function configOf(form: ToolForm): Record<string, unknown> {
  if (form.category === "http") {
    return {
      method: form.method,
      url: form.url,
      headers: parseJson(form.headers, {}, "headers") as Record<string, unknown>,
    };
  }
  return {
    command: form.command.trim(),
    args: parseJson(form.args, [], "args") as unknown[],
    env: parseJson(form.env, {}, "env") as Record<string, unknown>,
  };
}

function configSummary(t: ToolItem): string {
  const c = t.config as Record<string, unknown>;
  if (t.category === "http") return `${String(c.method || "").toUpperCase()} ${String(c.url || "")}`;
  return `command: ${String(c.command || "")} ${Array.isArray(c.args) && c.args.length ? `args: ${JSON.stringify(c.args)}` : ""}`.trim();
}

export default function ToolsPage() {
  const [category, setCategory] = useState<"http" | "mcp">("http");
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ToolItem | "new" | null>(null);
  const [form, setForm] = useState<ToolForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listToolLibrary(category)
      .then(setTools)
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, [category]);

  useEffect(load, [load]);

  const switchCategory = (c: "http" | "mcp") => {
    setCategory(c);
    setEditing(null);
  };

  const openNew = () => {
    setEditing("new");
    setForm({ ...EMPTY_FORM, category });
  };

  const openEdit = (t: ToolItem) => {
    const c = t.config as Record<string, unknown>;
    setEditing(t);
    setForm({
      name: t.name,
      category: t.category as "http" | "mcp",
      description: t.description,
      method: String(c.method || "GET").toUpperCase(),
      url: String(c.url || ""),
      headers: JSON.stringify(c.headers || {}, null, 2),
      command: String(c.command || ""),
      args: JSON.stringify(c.args || [], null, 2),
      env: JSON.stringify(c.env || {}, null, 2),
    });
  };

  const save = async () => {
    if (!form.name.trim()) {
      alert("请填写工具名称");
      return;
    }
    let config: Record<string, unknown>;
    try {
      config = configOf(form);
    } catch (e: unknown) {
      alert((e as Error).message);
      return;
    }
    const payload = { name: form.name.trim(), category: form.category, description: form.description, config };
    setBusy(true);
    try {
      if (editing === "new") await api.createTool(payload);
      else if (editing) await api.updateTool(editing.id, payload);
      setEditing(null);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: ToolItem) => {
    if (!confirm(`确认删除工具「${t.name}」？`)) return;
    try {
      await api.deleteTool(t.id);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">工具库</h1>
        <p className="text-sm text-slate-500 mt-1">自定义工具管理：HTTP 工具（method + url）与 MCP 工具（command + args）</p>
      </header>

      {/* 分类 Tab */}
      <div className="flex items-center gap-2 mb-6">
        {(["http", "mcp"] as const).map((c) => (
          <button
            key={c}
            onClick={() => switchCategory(c)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              category === c ? "bg-brand-600 text-white" : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
        <div className="flex-1" />
        <button className="btn-primary" onClick={openNew} disabled={editing !== null}>
          + 新增工具
        </button>
      </div>

      {/* 新增 / 编辑表单 */}
      {editing && (
        <div className="card p-5 mb-6 space-y-3">
          <h3 className="font-medium text-slate-700">
            {editing === "new" ? `新增${CATEGORY_LABEL[category]}工具` : `编辑工具「${editing.name}」`}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="label">名称（唯一，字母数字._-）</label>
              <input className="input font-mono" placeholder="如：weather_api" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">分类</label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as "http" | "mcp" })}
              >
                <option value="http">http</option>
                <option value="mcp">mcp</option>
              </select>
            </div>
            <div>
              <label className="label">描述</label>
              <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>

          {form.category === "http" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="label">Method</label>
                <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  {HTTP_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="label">URL</label>
                <input className="input font-mono" placeholder="https://api.example.com/data" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
              </div>
              <div className="md:col-span-3">
                <label className="label">Headers（JSON）</label>
                <textarea className="input min-h-[60px] font-mono text-xs" value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="label">启动命令 command</label>
                <input className="input font-mono" placeholder="如：npx -y @modelcontextprotocol/server-filesystem" value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} />
              </div>
              <div>
                <label className="label">args（JSON 数组）</label>
                <textarea className="input min-h-[60px] font-mono text-xs" value={form.args} onChange={(e) => setForm({ ...form, args: e.target.value })} />
              </div>
              <div>
                <label className="label">env（JSON 对象）</label>
                <textarea className="input min-h-[60px] font-mono text-xs" value={form.env} onChange={(e) => setForm({ ...form, env: e.target.value })} />
              </div>
            </div>
          )}

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
      ) : tools.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-400">
          暂无 {CATEGORY_LABEL[category]}，点击右上角「新增工具」添加
        </div>
      ) : (
        <div className="space-y-3">
          {tools.map((t) => (
            <div key={t.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 font-mono">{t.name}</span>
                    <span className="badge badge-blue">{CATEGORY_LABEL[t.category]}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-mono">{configSummary(t)}</div>
                  {t.description && <p className="text-xs text-slate-400 mt-1">{t.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="btn-secondary text-xs" onClick={() => openEdit(t)}>
                    编辑
                  </button>
                  <button className="btn-danger text-xs" onClick={() => remove(t)}>
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
