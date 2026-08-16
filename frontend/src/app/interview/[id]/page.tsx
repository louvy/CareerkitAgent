"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { InterviewQuestionItem, InterviewSessionDetail } from "@/types";

const CATEGORY_LABEL: Record<string, string> = {
  core_knowledge: "核心知识",
  project_deep_dive: "项目深挖",
  behavioral: "行为面试",
};

const CATEGORY_COLOR: Record<string, string> = {
  core_knowledge: "badge-blue",
  project_deep_dive: "badge-green",
  behavioral: "badge-amber",
};

interface ReviewPerQuestion {
  question_id?: number | null;
  question: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  reference: string;
}

interface ReviewReport {
  overall_score: number;
  summary: string;
  per_question: ReviewPerQuestion[];
  next_steps: string[];
}

export default function InterviewDetailPage({ params }: { params: { id: string } }) {
  const sessionId = Number(params.id);
  const [session, setSession] = useState<InterviewSessionDetail | null>(null);
  const [tab, setTab] = useState<"practice" | "coach">("practice");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  // 复盘
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<ReviewReport | null>(null);

  // 模拟面试
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [coachMsg, setCoachMsg] = useState("");
  const [coaching, setCoaching] = useState(false);

  const load = useCallback(() => {
    api.getSession(sessionId).then((s) => {
      setSession(s);
      const map: Record<number, string> = {};
      s.questions.forEach((q) => (map[q.id] = q.answer || ""));
      setAnswers(map);
      if (s.review) {
        const r = s.review.report as ReviewReport;
        setReview(r);
      }
    });
  }, [sessionId]);

  useEffect(load, [load]);

  const saveAnswer = async (qid: number) => {
    setSaving((s) => ({ ...s, [qid]: true }));
    try {
      await api.saveAnswer(qid, answers[qid] || "");
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setSaving((s) => ({ ...s, [qid]: false }));
    }
  };

  const runReview = async () => {
    setReviewing(true);
    try {
      const r = await api.reviewSession(sessionId);
      const report = r.report as unknown as ReviewReport;
      setReview(report);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setReviewing(false);
    }
  };

  const sendCoach = async () => {
    if (!coachMsg.trim() || coaching) return;
    const msg = coachMsg.trim();
    setChat((c) => [...c, { role: "user", content: msg }]);
    setCoachMsg("");
    setCoaching(true);
    try {
      const r = await api.coachTurn(sessionId, msg);
      setChat((c) => [...c, { role: "assistant", content: r.reply }]);
    } catch (e: unknown) {
      alert((e as Error).message);
      setChat((c) => c.slice(0, -1));
    } finally {
      setCoaching(false);
    }
  };

  if (!session) return <div className="p-8 text-sm text-slate-500">加载中…</div>;

  const answeredCount = session.questions.filter((q) => (answers[q.id] || "").trim()).length;

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-6">
        <Link href="/interview" className="text-xs text-slate-400 hover:text-brand-600">← 返回会话列表</Link>
        <h1 className="text-2xl font-semibold text-slate-800 mt-2">{session.title}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {session.question_count} 题 · 已作答 {answeredCount} 题
          {review && <span className="badge badge-green ml-2">已复盘 · 总分 {review.overall_score}</span>}
        </p>
      </header>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {([
          ["practice", "作答与复盘"],
          ["coach", "模拟面试"],
        ] as ["practice" | "coach", string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === key ? "border-brand-600 text-brand-600 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "practice" && (
        <div className="space-y-5">
          {session.questions.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              answer={answers[q.id] || ""}
              onAnswerChange={(text) => setAnswers((a) => ({ ...a, [q.id]: text }))}
              onSave={() => saveAnswer(q.id)}
              saving={!!saving[q.id]}
              reviewItem={review?.per_question?.find((r) => r.question === q.question || r.question_id === q.id)}
            />
          ))}

          <div className="card p-5 flex items-center justify-between sticky bottom-4">
            <div className="text-sm text-slate-600">
              {review ? (
                <span className="flex items-center gap-2">
                  复盘总分：<span className="text-lg font-semibold text-brand-600">{review.overall_score}</span>
                  <button className="btn-secondary text-xs" onClick={runReview} disabled={reviewing}>
                    {reviewing ? "评审中…" : "重新复盘"}
                  </button>
                </span>
              ) : (
                <span>全部作答完成后，由 reviewer Agent 独立评审（生成/评估分离）</span>
              )}
            </div>
            {!review && (
              <button className="btn-primary" onClick={runReview} disabled={reviewing || answeredCount === 0}>
                {reviewing ? "评审 Agent 复盘分析中…" : answeredCount === 0 ? "请先作答" : "生成 AI 复盘"}
              </button>
            )}
          </div>

          {review && (
            <div className="card p-5">
              <h4 className="font-medium text-slate-700 mb-2">整体评价</h4>
              <p className="text-sm text-slate-600 leading-6">{review.summary}</p>
              {review.next_steps.length > 0 && (
                <>
                  <h4 className="font-medium text-slate-700 mt-4 mb-2">下一步建议</h4>
                  <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                    {review.next_steps.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "coach" && (
        <div className="card flex flex-col h-[60vh]">
          <div className="px-5 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">
            interview-coach 模拟面试官（会话内自适应追问，带记忆）
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {chat.length === 0 && (
              <div className="text-center text-sm text-slate-400 py-16">
                <p className="mb-2">准备好了吗？向我打个招呼开始模拟面试</p>
                <p className="text-xs">面试官已读取你的简历 {session.resume_version_id ? "（基于当前版本）" : ""}</p>
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap ${
                    m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {coaching && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-xl px-4 py-2.5 text-sm text-slate-400 animate-pulse">面试官思考中…</div>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-slate-200 flex gap-2">
            <input
              className="input"
              placeholder="输入你的回答…"
              value={coachMsg}
              onChange={(e) => setCoachMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendCoach()}
            />
            <button className="btn-primary shrink-0" onClick={sendCoach} disabled={coaching || !coachMsg.trim()}>
              发送
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  q,
  answer,
  onAnswerChange,
  onSave,
  saving,
  reviewItem,
}: {
  q: InterviewQuestionItem;
  answer: string;
  onAnswerChange: (text: string) => void;
  onSave: () => void;
  saving: boolean;
  reviewItem?: ReviewPerQuestion;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-slate-400">Q{q.order_no + 1}</span>
        <span className={`badge ${CATEGORY_COLOR[q.category] || "badge-slate"}`}>
          {CATEGORY_LABEL[q.category] || q.category}
        </span>
        {reviewItem && (
          <span className={`badge ${reviewItem.score >= 7 ? "badge-green" : reviewItem.score >= 4 ? "badge-amber" : "badge-red"}`}>
            复盘 {reviewItem.score} 分
          </span>
        )}
      </div>
      <div className="text-sm font-medium text-slate-800 leading-6">{q.question}</div>
      {q.intent && <div className="text-xs text-slate-500 mt-1.5">考察点：{q.intent}</div>}

      <div className="mt-4">
        <label className="label">我的作答（草稿自动保存可随时修改）</label>
        <textarea
          className="input min-h-[96px] resize-y text-sm leading-5"
          placeholder="在此写下你的回答…"
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
        />
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-1.5 flex-wrap">
            {(q.reference_points || []).map((rp, i) => (
              <span key={i} className="badge badge-slate text-[10px]">{rp}</span>
            ))}
          </div>
          <button className="btn-secondary text-xs" onClick={onSave} disabled={saving}>
            {saving ? "保存中…" : "保存作答"}
          </button>
        </div>
      </div>

      {reviewItem && (
        <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-emerald-700 font-medium mb-1">优点</div>
            <ul className="list-disc list-inside text-slate-600 space-y-0.5">
              {reviewItem.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-red-600 font-medium mb-1">不足</div>
            <ul className="list-disc list-inside text-slate-600 space-y-0.5">
              {reviewItem.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-brand-600 font-medium mb-1">改进方向</div>
            <ul className="list-disc list-inside text-slate-600 space-y-0.5">
              {reviewItem.suggestions.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
            {reviewItem.reference && (
              <div className="mt-1.5 text-slate-400">参考：{reviewItem.reference}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
