"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { AgentRun } from "@/types";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours(),
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export default function TracesPage() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listRuns()
      .then(setRuns)
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">链路追踪</h1>
          <p className="text-sm text-slate-500 mt-1">Agent 运行记录：调用方式（invoke / stream）、耗时、状态与执行时间，点击查看整条链路</p>
        </div>
        <button className="btn-secondary text-xs" onClick={load} disabled={loading}>
          {loading ? "加载中…" : "↻ 刷新"}
        </button>
      </header>

      {loading ? (
        <div className="text-sm text-slate-500 py-16 text-center">加载中…</div>
      ) : runs.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-400">暂无运行记录，先运行一个 Agent 吧</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3 font-medium">Name（调用方式）</th>
                <th className="px-5 py-3 font-medium">耗时</th>
                <th className="px-5 py-3 font-medium">Token</th>
                <th className="px-5 py-3 font-medium">状态</th>
                <th className="px-5 py-3 font-medium">执行时间</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const seconds = run.stats?.elapsed_ms ? (run.stats.elapsed_ms / 1000).toFixed(2) : "—";
                const failed = run.status === "failed" || run.status === "error";
                const rejected = run.status === "rejected";
                return (
                  <tr key={run.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700">{run.agent_name || `#${run.agent_id}`}</span>
                        <span className={`badge ${run.call_type === "stream" ? "badge-blue" : "badge-slate"}`}>
                          {run.call_type || "invoke"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[260px]">{run.input_summary || run.run_id}</div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-600">{seconds}s</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {run.stats?.token_input ?? 0} / {run.stats?.token_output ?? 0}
                    </td>
                    <td className="px-5 py-3.5">
                      {failed ? (
                        <span className="badge badge-red">失败</span>
                      ) : rejected ? (
                        <span className="badge badge-amber">拒绝</span>
                      ) : (
                        <span className="badge badge-green">成功</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 font-mono">{fmtTime(run.created_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/traces/${run.run_id}`} className="text-brand-600 text-xs hover:underline">
                        查看链路 →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
