"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DashboardStats } from "@/types";

const STAT_CARDS = [
  { key: "resume_count", label: "简历", icon: "▤", color: "bg-brand-50 text-brand-600" },
  { key: "jd_count", label: "JD 职位", icon: "⇄", color: "bg-emerald-50 text-emerald-600" },
  { key: "match_count", label: "匹配任务", icon: "◈", color: "bg-violet-50 text-violet-600" },
  { key: "question_count", label: "面试题目", icon: "◉", color: "bg-amber-50 text-amber-600" },
  { key: "session_count", label: "刷题会话", icon: "▣", color: "bg-rose-50 text-rose-600" },
  { key: "review_count", label: "AI 复盘", icon: "✦", color: "bg-cyan-50 text-cyan-600" },
  { key: "run_count", label: "Agent 运行", icon: "✳", color: "bg-slate-100 text-slate-600" },
] as const;

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api.dashboardStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">控制中心</h1>
        <p className="text-sm text-slate-500 mt-1">从简历编辑到 Offer 的 Agent 求职工作台</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className="card p-5">
            <div className={`w-9 h-9 rounded-lg grid place-items-center text-lg ${card.color}`}>{card.icon}</div>
            <div className="mt-3 text-2xl font-semibold text-slate-800">
              {stats ? stats[card.key] : "—"}
            </div>
            <div className="text-sm text-slate-500">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="card p-6 mt-8">
        <h2 className="font-medium text-slate-700 mb-4">开始使用</h2>
        <ol className="space-y-3 text-sm text-slate-600 list-decimal list-inside">
          <li>在「设置」页配置 LLM 供应商（OpenAI 兼容接口），并创建知识库上传资料</li>
          <li>在「Agent」页完成 简历诊断/优化/JD匹配/出题 等 Agent 的 配置 → 审查 → 启用 闭环</li>
          <li>在「简历库」创建简历，使用 AI 诊断与优化生成针对性版本</li>
          <li>在「JD 匹配」粘贴职位描述，获取逐条要求匹配诊断与措辞建议</li>
          <li>在「面试刷题」基于简历+JD 生成题目、作答并获取 AI 复盘</li>
        </ol>
      </div>
    </div>
  );
}
