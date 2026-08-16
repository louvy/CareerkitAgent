"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { InfraStatus, SystemStatus, TokenStatItem } from "@/types";

// Token 统计按 Asia/Shanghai 时区归日，默认日期范围需与该时区对齐
const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const today = () => fmtDate(new Date());
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  return fmtDate(d);
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatusCard({ title, icon, status, detail }: { title: string; icon: string; status?: InfraStatus; detail: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="font-medium text-slate-700">{title}</span>
        </div>
        {status ? (
          status.ok ? (
            <span className="badge badge-green">正常</span>
          ) : (
            <span className="badge badge-red">异常</span>
          )
        ) : (
          <span className="badge badge-slate">检测中…</span>
        )}
      </div>
      <div className="text-xs text-slate-500 space-y-1">
        {status ? (status.ok ? detail : <div className="text-red-500 break-all">✗ {status.error}</div>) : <div>—</div>}
      </div>
    </div>
  );
}

export default function MonitorPage() {
  const [sys, setSys] = useState<SystemStatus | null>(null);
  const [loadingSys, setLoadingSys] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [start, setStart] = useState(daysAgo(14));
  const [end, setEnd] = useState(today());
  const [items, setItems] = useState<TokenStatItem[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);

  const loadSystem = useCallback(async () => {
    setLoadingSys(true);
    try {
      setSys(await api.monitorSystem());
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setLoadingSys(false);
    }
  }, []);

  useEffect(() => {
    loadSystem();
  }, [loadSystem]);

  const loadTokens = useCallback(async () => {
    setLoadingTokens(true);
    try {
      const r = await api.tokenStats(start, end);
      setItems(r.items);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setLoadingTokens(false);
    }
  }, [start, end]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadSystem(), loadTokens()]);
    setRefreshing(false);
  };

  const quickDays = (n: number) => {
    setStart(daysAgo(n));
    setEnd(today());
  };

  // 图表数据
  const { totalAgent, totalUser, maxVal, chart } = useMemo(() => {
    const agent = items.reduce((s, i) => s + i.agent_tokens, 0);
    const user = items.reduce((s, i) => s + i.user_tokens, 0);
    const max = Math.max(...items.map((i) => Math.max(i.agent_tokens, i.user_tokens)), 1);
    const W = 880;
    const H = 240;
    const pad = { top: 14, bottom: 26, left: 8, right: 8 };
    const n = Math.max(items.length, 1);
    const slot = (W - pad.left - pad.right) / n;
    const barW = Math.max(Math.min(slot * 0.36, 16), 2);
    const h2 = (v: number) => Math.round((v / max) * (H - pad.top - pad.bottom));
    const series = items.map((it, idx) => {
      const cx = pad.left + slot * idx + slot / 2;
      const x0 = cx - barW - 1;
      const x1 = cx + 1;
      const aH = h2(it.agent_tokens);
      const uH = h2(it.user_tokens);
      return {
        key: it.date,
        label: it.date.slice(5),
        x0,
        x1,
        yA: H - pad.bottom - aH,
        aH,
        yU: H - pad.bottom - uH,
        uH,
        tooltip: `${it.date}\nAgent ${it.agent_tokens.toLocaleString()}\n用户 ${it.user_tokens.toLocaleString()}\n${it.runs} 次运行`,
      };
    });
    return { totalAgent: agent, totalUser: user, maxVal: max, chart: series };
  }, [items]);

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">系统监控</h1>
          <p className="text-sm text-slate-500 mt-1">基础设施状态（PostgreSQL / pgvector / Redis / MinIO）与 Token 消耗趋势</p>
        </div>
        <button className="btn-secondary text-xs" onClick={refresh} disabled={refreshing}>
          {refreshing ? "刷新中…" : "↻ 刷新"}
        </button>
      </header>

      {/* 基础设施状态 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatusCard
          title="PostgreSQL"
          icon="🐘"
          status={sys?.postgres}
          detail={
            <>
              <div>版本：{sys?.postgres.version || "—"}</div>
              <div>数据表：{sys?.postgres.tables ?? "—"} 张</div>
              <div className="flex gap-2 mt-1">
                <span className={`badge ${sys?.postgres.pgvector ? "badge-green" : "badge-red"}`}>pgvector</span>
                <span className={`badge ${sys?.postgres.pg_trgm ? "badge-green" : "badge-red"}`}>pg_trgm</span>
              </div>
            </>
          }
        />
        <StatusCard
          title="Redis"
          icon="🧬"
          status={sys?.redis}
          detail={
            <>
              <div>版本：{sys?.redis.version || "—"}</div>
              <div>Key 数量：{sys?.redis.keys ?? "—"}</div>
              <div className="text-slate-400 mt-1">用于缓存与速率限制</div>
            </>
          }
        />
        <StatusCard
          title="MinIO"
          icon="📦"
          status={sys?.minio}
          detail={
            <>
              <div>Buckets：{(sys?.minio.buckets || []).join("、") || "—"}</div>
              <div className="text-slate-400 mt-1">用于简历文档 / 知识库原文存储</div>
            </>
          }
        />
      </div>

      {/* Token 消耗 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="font-medium text-slate-700">Token 消耗（按日期）</h3>
            <div className="text-xs text-slate-400 mt-1">
              用户消耗（输入）合计 <span className="font-mono text-slate-600">{fmtTokens(totalUser)}</span>
              ，Agent 消耗（输出）合计 <span className="font-mono text-slate-600">{fmtTokens(totalAgent)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <input type="date" className="input !w-auto !py-1.5" value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="text-slate-400">至</span>
            <input type="date" className="input !w-auto !py-1.5" value={end} onChange={(e) => setEnd(e.target.value)} />
            {[7, 14, 30, 90].map((n) => (
              <button key={n} className="btn-secondary !px-2.5 !py-1.5" onClick={() => quickDays(n)}>
                {n}天
              </button>
            ))}
          </div>
        </div>

        {/* 图例 */}
        <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-brand-500 inline-block" /> Agent（输出）
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" /> 用户（输入）
          </span>
        </div>

        {loadingTokens ? (
          <div className="text-sm text-slate-400 py-16 text-center">加载中…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-400 py-16 text-center">所选区间无数据</div>
        ) : (
          <div className="overflow-x-auto">
            <svg viewBox="0 0 880 240" className="min-w-[640px] w-full" role="img" aria-label="Token 消耗柱状图">
              {/* 横向网格线 */}
              {[0.25, 0.5, 0.75, 1].map((r) => {
                const y = 240 - 26 - r * (240 - 14 - 26);
                return (
                  <g key={r}>
                    <line x1={8} x2={872} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
                    <text x={8} y={y - 3} fontSize={9} fill="#94a3b8">
                      {fmtTokens(Math.round(maxVal * r))}
                    </text>
                  </g>
                );
              })}
              {/* 柱 */}
              {chart.map((s) => (
                <g key={s.key}>
                  <rect x={s.x0} y={s.yA} width={18} height={Math.max(s.aH, 1)} rx={2} fill="#4f6ef7">
                    <title>{s.tooltip}</title>
                  </rect>
                  <rect x={s.x1} y={s.yU} width={18} height={Math.max(s.uH, 1)} rx={2} fill="#fbbf24">
                    <title>{s.tooltip}</title>
                  </rect>
                  {items.length <= 31 && (
                    <text x={s.x0 + 9} y={240 - 10} fontSize={9} fill="#94a3b8" textAnchor="middle">
                      {s.label}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
        )}
        <div className="text-[11px] text-slate-300 mt-2">基于 agent_runs.stats 聚合，时区 Asia/Shanghai；无数据日期自动补零</div>
      </div>
    </div>
  );
}
