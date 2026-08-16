"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AgentItem, AgentRun, KnowledgeBaseItem, LLMModelItem } from "@/types";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  configured: "已配置",
  reviewed: "已审查",
  enabled: "已启用",
  disabled: "已停用",
};

const STATUS_BADGE: Record<string, string> = {
  draft: "badge-slate",
  configured: "badge-blue",
  reviewed: "badge-amber",
  enabled: "badge-green",
  disabled: "badge-red",
};

const STRATEGY_LABEL: Record<string, string> = {
  simple_chat: "Simple Chat",
  react: "ReAct",
  plan_execute: "Plan & Execute",
  workbench: "Workbench",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBaseItem[]>([]);
  const [chatModels, setChatModels] = useState<LLMModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // 配置表单
  const [form, setForm] = useState<{
    display_name: string;
    description: string;
    model: string;
    temperature: string;
    max_tokens: string;
    system_prompt: string;
    allowed_tools: string[];
    knowledge_base_ids: number[];
  } | null>(null);

  // 运行历史
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [trace, setTrace] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.listAgents(), api.listAgentTools(), api.listKbs(), api.listModels("chat")])
      .then(([a, t, k, m]) => {
        setAgents(a);
        setTools(t.tools);
        setKbs(k);
        setChatModels(m);
      })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const refresh = (updated?: AgentItem) => {
    if (updated) setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    else load();
  };

  const openPanel = (agent: AgentItem) => {
    if (expanded === agent.id) {
      setExpanded(null);
      return;
    }
    setExpanded(agent.id);
    setForm({
      display_name: agent.display_name,
      description: agent.description,
      model: (agent.config.model as string) || "",
      temperature: String(agent.config.temperature ?? 0.7),
      max_tokens: String(agent.config.max_tokens ?? 2048),
      system_prompt: (agent.config.system_prompt as string) || "",
      allowed_tools: ((agent.config.allowed_tools as string[]) || []).filter((t) => tools.includes(t) || t === "search_knowledge"),
      knowledge_base_ids: agent.knowledge_base_ids || [],
    });
    setTrace(null);
    api.listRuns(agent.id).then(setRuns).catch(() => {});
  };

  const saveConfig = async (agent: AgentItem) => {
    if (!form) return;
    setBusy(true);
    try {
      const updated = await api.configureAgent(agent.id, {
        display_name: form.display_name,
        description: form.description,
        model: form.model || null,
        temperature: parseFloat(form.temperature),
        max_tokens: parseInt(form.max_tokens, 10),
        system_prompt: form.system_prompt,
        allowed_tools: form.allowed_tools,
        knowledge_base_ids: form.knowledge_base_ids,
      });
      refresh(updated);
      if (agent.status !== "draft" && updated.status === "configured") {
        alert("配置已保存，需重新「提交审查 → 启用」后生效");
      }
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const transition = async (agent: AgentItem, action: "review" | "enable" | "disable") => {
    setBusy(true);
    try {
      const updated =
        action === "review"
          ? await api.reviewAgent(agent.id)
          : action === "enable"
            ? await api.enableAgent(agent.id)
            : await api.disableAgent(agent.id);
      refresh(updated);
      setRuns((prev) => [...prev]); // 触发审计不会产生 run，仅保持面板
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const viewTrace = async (runId: string) => {
    try {
      const r = await api.getTrace(runId);
      setTrace({ ...(r.trace as unknown as Record<string, unknown>) });
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  };

  const toggleTool = (tool: string) => {
    if (!form) return;
    setForm({
      ...form,
      allowed_tools: form.allowed_tools.includes(tool)
        ? form.allowed_tools.filter((t) => t !== tool)
        : [...form.allowed_tools, tool],
    });
  };

  const toggleKb = (id: number) => {
    if (!form) return;
    setForm({
      ...form,
      knowledge_base_ids: form.knowledge_base_ids.includes(id)
        ? form.knowledge_base_ids.filter((x) => x !== id)
        : [...form.knowledge_base_ids, id],
    });
  };

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">Agent 控制台</h1>
        <p className="text-sm text-slate-500 mt-1">
          生命周期闭环强制：<span className="text-slate-600">草稿 → 配置 → 审查 → 启用</span>，仅「已启用」Agent 可被调度执行
        </p>
      </header>

      {loading ? (
        <div className="text-sm text-slate-500 py-16 text-center">加载中…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className={`card ${expanded === agent.id ? "ring-2 ring-brand-500" : ""}`}>
              <div className="p-5 cursor-pointer" onClick={() => openPanel(agent)}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{agent.display_name}</span>
                      {agent.is_builtin && <span className="badge badge-slate">内置</span>}
                      <span className="text-xs text-slate-400 font-mono">{agent.name}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-5">{agent.description}</p>
                  </div>
                  <span className={`badge ${STATUS_BADGE[agent.status] || "badge-slate"}`}>
                    {STATUS_LABEL[agent.status] || agent.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3 text-xs text-slate-400">
                  <span className="badge badge-blue">{STRATEGY_LABEL[agent.strategy] || agent.strategy}</span>
                  <span>模型：{String(agent.config.model || "默认")}</span>
                </div>
              </div>

              {expanded === agent.id && form && (
                <div className="border-t border-slate-200 p-5 space-y-4">
                  {/* 状态流转 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">状态流转：</span>
                    {agent.status === "draft" && (
                      <button className="btn-primary text-xs" onClick={() => saveConfig(agent)} disabled={busy}>
                        保存并进入「已配置」
                      </button>
                    )}
                    {agent.status === "configured" && (
                      <button className="btn-primary text-xs" onClick={() => transition(agent, "review")} disabled={busy}>
                        提交审查
                      </button>
                    )}
                    {agent.status === "reviewed" && (
                      <button className="btn-primary text-xs" onClick={() => transition(agent, "enable")} disabled={busy}>
                        启用 Agent
                      </button>
                    )}
                    {agent.status === "enabled" && (
                      <>
                        <button className="btn-secondary text-xs" onClick={() => transition(agent, "disable")} disabled={busy}>
                          停用
                        </button>
                        <span className="badge badge-green">可被编排器调度</span>
                      </>
                    )}
                    {agent.status === "disabled" && (
                      <button className="btn-primary text-xs" onClick={() => transition(agent, "enable")} disabled={busy}>
                        重新启用
                      </button>
                    )}
                  </div>

                  {/* 配置表单 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="label">显示名称</label>
                      <input className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">模型（从模型管理选择）</label>
                      <select
                        className="input"
                        value={form.model}
                        onChange={(e) => setForm({ ...form, model: e.target.value })}
                      >
                        <option value="">默认模型</option>
                        {chatModels.map((m) => (
                          <option key={m.id} value={m.model}>
                            {m.name}（{m.model}）{m.is_default ? " · 默认" : ""}
                          </option>
                        ))}
                      </select>
                      {chatModels.length === 0 && (
                        <div className="text-[11px] text-amber-600 mt-1">暂无 chat 模型，请先到「模型管理」添加</div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label">温度</label>
                        <input type="number" step="0.1" min="0" max="2" className="input" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Max Tokens</label>
                        <input type="number" min="1" className="input" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="label">描述</label>
                    <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">系统提示词（宪法自动注入，此处为职责补充）</label>
                    <textarea className="input min-h-[80px] text-xs leading-5 font-mono" value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">工具白名单（ToolGuard 强制校验）</label>
                    <div className="flex flex-wrap gap-2">
                      {tools.map((t) => (
                        <button key={t} onClick={() => toggleTool(t)} className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${form.allowed_tools.includes(t) ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-600 border-slate-300"}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="label">知识库绑定</label>
                    <div className="flex flex-wrap gap-2">
                      {kbs.length === 0 && <span className="text-xs text-slate-400">暂无知识库，请到「知识库」创建</span>}
                      {kbs.map((kb) => (
                        <button key={kb.id} onClick={() => toggleKb(kb.id)} className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${form.knowledge_base_ids.includes(kb.id) ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-600 border-slate-300"}`}>
                          {kb.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {agent.status !== "draft" && (
                    <button className="btn-secondary text-xs" onClick={() => saveConfig(agent)} disabled={busy}>
                      保存配置（重新进入「已配置」，需再次审查）
                    </button>
                  )}

                  {/* 运行历史 */}
                  <div>
                    <h4 className="text-xs font-medium text-slate-500 mb-2">运行历史（可回放 Trace）</h4>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {runs.length === 0 && <div className="text-xs text-slate-300">暂无运行记录</div>}
                      {runs.map((run) => (
                        <div key={run.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2">
                          <span className={`badge ${run.status === "success" ? "badge-green" : run.status === "failed" ? "badge-red" : "badge-amber"}`}>
                            {run.status}
                          </span>
                          <span className="text-slate-500 flex-1 truncate">{run.input_summary}</span>
                          <span className="text-slate-300">{run.stats?.elapsed_ms ? `${run.stats.elapsed_ms}ms` : ""}</span>
                          <button className="text-brand-600 hover:underline" onClick={() => viewTrace(run.run_id)}>
                            Trace
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {trace && (
                    <div>
                      <h4 className="text-xs font-medium text-slate-500 mb-2">Trace 详情</h4>
                      <pre className="text-[10px] leading-4 bg-slate-900 text-slate-200 rounded-lg p-3 overflow-x-auto max-h-64">
                        {JSON.stringify(trace, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
