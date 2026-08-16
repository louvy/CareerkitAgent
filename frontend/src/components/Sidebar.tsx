"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_GROUPS = [
  {
    title: "业务",
    items: [
      { href: "/", label: "控制中心", icon: "◈" },
      { href: "/resume", label: "简历库", icon: "▤" },
      { href: "/jd-match", label: "JD 匹配", icon: "⇄" },
      { href: "/interview", label: "面试刷题", icon: "◉" },
      { href: "/agents", label: "Agent", icon: "✳" },
    ],
  },
  {
    title: "管理",
    items: [
      { href: "/models", label: "模型管理", icon: "🧠" },
      { href: "/knowledge", label: "知识库", icon: "📚" },
      { href: "/tools", label: "工具库", icon: "🔧" },
    ],
  },
  {
    title: "可观测",
    items: [
      { href: "/monitor", label: "系统监控", icon: "📊" },
      { href: "/traces", label: "链路追踪", icon: "🕸" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-52 shrink-0 bg-white border-r border-slate-200 flex flex-col min-h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-slate-100">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-brand-600 text-white grid place-items-center font-bold">CK</span>
          <div>
            <div className="font-semibold text-slate-800 leading-tight">CareerKit</div>
            <div className="text-[11px] text-slate-400">Agent 求职入职助手</div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-3 mb-1 text-[10px] font-medium text-slate-300 uppercase tracking-wider">{group.title}</div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active ? "bg-brand-50 text-brand-600 font-medium" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-5 py-4 text-[11px] text-slate-400 border-t border-slate-100">
        Harness 三支柱驱动<br />可观测 · 治理安全 · 验证质量
      </div>
    </aside>
  );
}
