"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { TraceDetail, TraceEvent } from "@/types";

const KIND_STYLE: Record<string, string> = {
  node_start: "text-brand-600 bg-brand-50 border-brand-200",
  node_end: "text-slate-600 bg-slate-100 border-slate-200",
  llm_call: "text-emerald-700 bg-emerald-50 border-emerald-200",
  tool_call: "text-amber-700 bg-amber-50 border-amber-200",
};

const KIND_LABEL: Record<string, string> = {
  node_start: "节点开始",
  node_end: "节点结束",
  llm_call: "LLM 调用",
  tool_call: "工具调用",
};

function eventTitle(e: TraceEvent): string {
  const p = e.payload as Record<string, unknown>;
  if (e.kind === "node_start") return `▶ ${String(p.node || "?")}`;
  if (e.kind === "node_end") return `■ ${String(p.node || "?")}`;
  if (e.kind === "llm_call") return `${String(p.model || "")} · 输入 ${String(p.input_tokens ?? 0)} / 输出 ${String(p.output_tokens ?? 0)} token`;
  if (e.kind === "tool_call") return `${String(p.name || "?")} · ${p.ok ? "调用成功" : "调用失败"}`;
  return e.kind;
}

function PayloadView({ event }: { event: TraceEvent }) {
  const [open, setOpen] = useState(false);
  const p = event.payload as Record<string, unknown>;
  if (!p || Object.keys(p).length === 0) return null;
  const preview = JSON.stringify(p).slice(0, 120);
  return (
    <div className="mt-1.5">
      <button className="text-[10px] text-slate-400 hover:text-brand-600" onClick={() => setOpen(!open)}>
        {open ? "收起明细 ▲" : `明细 ▼ ${preview}${preview.length >= 120 ? "…" : ""}`}
      </button>
      {open && (
        <pre className="mt-1.5 text-[10px] leading-4 bg-slate-900 text-slate-200 rounded-lg p-3 overflow-x-auto max-h-64">
          {JSON.stringify(p, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function TraceDetailPage() {
  const params = useParams<{ runId: string }>();
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getTrace(params.runId)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.runId]);

  const { events, spans } = useMemo(() => {
    const evts = detail?.trace.events || [];
    const t0 = evts.length ? evts[0].ts : 0;
    const starts = new Map<string, number>();
    const spanList: Record<number, number> = {};
    evts.forEach((e, i) => {
      if (e.kind === "node_start") starts.set(String((e.payload as Record<string, unknown>).node || ""), e.ts);
      if (e.kind === "node_end") {
        const node = String((e.payload as Record<string, unknown>).node || "");
        const s = starts.get(node);
        if (s !== undefined) spanList[i] = (e.ts - s) * 1000;
        starts.delete(node);
      }
    });
    return { events: evts, spans: spanList, t0 };
  }, [detail]);

  if (loading) return <div className="p-8 text-sm text-slate-500 text-center">加载中…</div>;
  if (error) return <div className="p-8 text-sm text-red-500 text-center">加载失败：{error}</div>;
  if (!detail) return null;

  const t0 = events.length ? events[0].ts : 0;

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <Link href="/traces" className="text-xs text-brand-600 hover:underline">
          ← 返回链路列表
        </Link>
        <h1 className="text-2xl font-semibold text-slate-800 mt-2">链路详情</h1>
        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
          <span className="badge badge-blue">{detail.agent_name}</span>
          <span className="font-mono">{detail.run_id}</span>
          <span className="text-slate-300">·</span>
          <span className="font-mono">{new Date(detail.created_at).toLocaleString()}</span>
          <span className="text-slate-300">·</span>
          <span>{events.length} 个事件</span>
        </div>
      </div>

      {/* 时间线 */}
      <div className="card p-6 mb-6">
        <h3 className="font-medium text-slate-700 mb-4">执行时间线（{events.length ? `${((events[events.length - 1].ts - t0) * 1000).toFixed(0)} ms` : "—"}）</h3>
        <div className="space-y-0">
          {events.map((e, i) => {
            const rel = ((e.ts - t0) * 1000).toFixed(0);
            const dur = spans[i];
            return (
              <div key={i} className="flex gap-3">
                {/* 时间轴 */}
                <div className="flex flex-col items-center w-10 shrink-0">
                  <div
                    className={`w-2.5 h-2.5 rounded-full mt-1.5 border-2 ${
                      e.kind === "node_start"
                        ? "bg-brand-500 border-brand-200"
                        : e.kind === "llm_call"
                          ? "bg-emerald-500 border-emerald-200"
                          : e.kind === "tool_call"
                            ? "bg-amber-400 border-amber-200"
                            : "bg-slate-300 border-slate-100"
                    }`}
                  />
                  {i < events.length - 1 && <div className="w-px flex-1 bg-slate-200" />}
                </div>
                {/* 事件内容 */}
                <div className="flex-1 pb-4 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-slate-300">+{rel}ms</span>
                    <span className={`badge border ${KIND_STYLE[e.kind] || "text-slate-600 bg-slate-100 border-slate-200"}`}>
                      {KIND_LABEL[e.kind] || e.kind}
                    </span>
                    <span className="text-xs text-slate-600 font-medium break-all">{eventTitle(e)}</span>
                    {dur !== undefined && <span className="badge badge-slate">{dur.toFixed(0)} ms</span>}
                  </div>
                  <PayloadView event={e} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Prompts */}
      {(detail.trace.prompts || []).length > 0 && (
        <div className="card p-6 mb-6">
          <h3 className="font-medium text-slate-700 mb-3">Prompt 记录（{detail.trace.prompts.length} 次 LLM 调用）</h3>
          <div className="space-y-3">
            {detail.trace.prompts.map((p, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1.5">
                  <span className="font-mono">#{i + 1}</span>
                  <span className="font-mono">{p.model}</span>
                  <span className="font-mono">{new Date(p.ts * 1000).toLocaleTimeString()}</span>
                </div>
                <div className="text-[11px] leading-4 text-slate-600 whitespace-pre-wrap line-clamp-4 max-h-24 overflow-y-auto">
                  <span className="text-slate-400 font-medium">System: </span>
                  {p.system}
                </div>
                <div className="text-[11px] leading-4 text-slate-600 whitespace-pre-wrap line-clamp-4 max-h-24 overflow-y-auto mt-1">
                  <span className="text-slate-400 font-medium">User: </span>
                  {p.user}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 最终输出 */}
      {detail.trace.final_output !== undefined && detail.trace.final_output !== null && (
        <div className="card p-6">
          <h3 className="font-medium text-slate-700 mb-3">最终输出</h3>
          <pre className="text-xs leading-5 bg-slate-900 text-slate-200 rounded-lg p-4 overflow-x-auto max-h-96 whitespace-pre-wrap">
            {typeof detail.trace.final_output === "string"
              ? detail.trace.final_output
              : JSON.stringify(detail.trace.final_output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
