'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/jadeai/ui/dialog';
import { Button } from '@/components/jadeai/ui/button';
import { Input } from '@/components/jadeai/ui/input';
import { Label } from '@/components/jadeai/ui/label';
import { ScrollArea } from '@/components/jadeai/ui/scroll-area';
import { useResumeStore } from '@/components/jadeai/editor/resume-store';
import { fromJadeResume, legacySectionsToJade, suggestionTextToLegacyItems } from '@/components/jadeai/lib/adapter';
import { api } from '@/lib/api';
import type { Diagnosis, OptimizationSuggestions } from '@/types';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Stethoscope,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const DIRECTIONS: { value: string; label: string }[] = [
  { value: 'clarity', label: '提升表述清晰度' },
  { value: 'impact', label: '强化成果与影响力' },
  { value: 'concision', label: '精简冗余表述' },
  { value: 'ats', label: '提升 ATS 可读性' },
];

type Step = 'start' | 'diagnosing' | 'diagnosis' | 'optimizing' | 'suggestions' | 'applying' | 'done';

interface AiAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AiAssistantDialog({ open, onOpenChange }: AiAssistantDialogProps) {
  const versionId = useResumeStore((s) => s.versionId);

  const [step, setStep] = useState<Step>('start');
  const [error, setError] = useState('');
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [checkedIssues, setCheckedIssues] = useState<Set<string>>(new Set());
  const [directions, setDirections] = useState<string[]>(['clarity', 'impact']);
  const [extraInstruction, setExtraInstruction] = useState('');
  const [suggestions, setSuggestions] = useState<OptimizationSuggestions | null>(null);
  const [checkedSuggestionKeys, setCheckedSuggestionKeys] = useState<Set<string>>(new Set());
  const [versionLabel, setVersionLabel] = useState('AI 优化版');
  const [appliedLabel, setAppliedLabel] = useState('');

  useEffect(() => {
    if (open) {
      setStep('start');
      setError('');
      setDiagnosis(null);
      setSuggestions(null);
      setCheckedIssues(new Set());
      setCheckedSuggestionKeys(new Set());
      setDirections(['clarity', 'impact']);
      setExtraInstruction('');
      setVersionLabel('AI 优化版');
      setAppliedLabel('');
    }
  }, [open]);

  const toggleIssue = (key: string) => {
    setCheckedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDirection = (value: string) => {
    setDirections((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  };

  const toggleSuggestion = (key: string) => {
    setCheckedSuggestionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** 阶段 1：AI 诊断（只读，不修改简历） */
  const handleDiagnose = useCallback(async () => {
    if (!versionId) return;
    setStep('diagnosing');
    setError('');
    try {
      const res = await api.diagnose(versionId);
      setDiagnosis(res.diagnosis);
      setCheckedIssues(new Set(res.diagnosis.issues.map((_, i) => String(i))));
      setStep('diagnosis');
    } catch (err) {
      setError(err instanceof Error ? err.message : '诊断失败，请稍后重试');
      setStep('start');
    }
  }, [versionId]);

  /** 阶段 2：基于勾选问题 + 方向生成优化建议 */
  const handleOptimize = useCallback(async () => {
    if (!versionId || !diagnosis) return;
    setStep('optimizing');
    setError('');
    try {
      const selectedIssues = diagnosis.issues.filter((_, i) => checkedIssues.has(String(i)));
      const res = await api.optimize(versionId, {
        selected_issues: selectedIssues,
        directions,
        extra_instruction: extraInstruction,
      });
      setSuggestions(res.suggestions);
      setCheckedSuggestionKeys(new Set(res.suggestions.suggestions.map((_, i) => String(i))));
      setStep('suggestions');
    } catch (err) {
      setError(err instanceof Error ? err.message : '优化失败，请稍后重试');
      setStep('diagnosis');
    }
  }, [versionId, diagnosis, checkedIssues, directions, extraInstruction]);

  /** 阶段 3：用户确认后的建议生成新版本（原版保留），并补写 jade 结构 */
  const handleApply = useCallback(async () => {
    if (!versionId || !suggestions) return;
    const store = useResumeStore.getState();
    const resume = store.currentResume;
    if (!resume) return;
    setStep('applying');
    setError('');
    try {
      const baseJade = store.sections;
      const legacy = fromJadeResume({ ...resume, sections: baseJade }).sections || [];
      const checked = suggestions.suggestions.filter((_, i) => checkedSuggestionKeys.has(String(i)));

      // 按 section 标题应用建议（同标题多条建议合并为新 items）
      const applied = legacy.map((sec) => {
        const suggs = checked.filter((s) => s.section === sec.title);
        if (suggs.length === 0) return sec;
        const newItems = suggs.flatMap((s) => suggestionTextToLegacyItems(s.suggestion));
        return { ...sec, items: newItems };
      });
      const knownTitles = new Set(applied.map((s) => s.title));
      for (const s of checked) {
        if (!knownTitles.has(s.section)) {
          applied.push({ title: s.section, items: suggestionTextToLegacyItems(s.suggestion) });
          knownTitles.add(s.section);
        }
      }

      const sectionsDict: Record<string, unknown[]> = {};
      applied.forEach((s) => { sectionsDict[s.title] = s.items; });

      const res = await api.applySuggestions(versionId, {
        label: versionLabel.trim() || 'AI 优化版',
        version_type: 'general',
        sections: sectionsDict,
      });

      // 新版本补写 jade 结构化数据（sections/themeConfig/template），保证编辑器可打开
      const content = {
        jade: {
          sections: legacySectionsToJade(applied, baseJade),
          themeConfig: resume.themeConfig,
          template: resume.template,
        },
        sections: applied,
        template: `jadeai-${resume.template || 'classic'}`,
      };
      await api.updateVersion(res.id, { content, notes: `基于版本 ${versionId} 的 AI 优化结果（用户确认后生成）` });

      setAppliedLabel(res.label);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成版本失败，请稍后重试');
      setStep('suggestions');
    }
  }, [versionId, suggestions, checkedSuggestionKeys, versionLabel]);

  const isLoading = step === 'diagnosing' || step === 'optimizing' || step === 'applying';
  const showFooter = step !== 'start' && !isLoading;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isLoading) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" />
            AI 简历助手
          </DialogTitle>
          <DialogDescription>
            基于当前简历版本快照诊断问题、生成逐条优化建议；确认后生成新版本，原版始终保留。
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-[320px] flex-col px-6 py-5">
          {/* 步骤指示 */}
          <div className="mb-4 flex items-center gap-1.5 text-xs text-zinc-400">
            <span className={cn('flex items-center gap-1', step !== 'start' && 'text-brand')}>
              <Stethoscope className="h-3.5 w-3.5" /> 诊断
            </span>
            <ArrowRight className="h-3 w-3" />
            <span className={cn('flex items-center gap-1', (step === 'suggestions' || step === 'applying' || step === 'done') && 'text-brand')}>
              <Wand2 className="h-3.5 w-3.5" /> 优化建议
            </span>
            <ArrowRight className="h-3 w-3" />
            <span className={cn('flex items-center gap-1', step === 'done' && 'text-brand')}>
              <CheckCircle2 className="h-3.5 w-3.5" /> 新版本
            </span>
          </div>

          <ScrollArea className="min-h-0 flex-1 pr-2">
            {step === 'start' && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Stethoscope className="h-10 w-10 text-brand/70 mb-4" />
                <p className="max-w-md text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  点击「开始 AI 诊断」，AI 将只读分析当前版本的简历内容，输出：
                  诊断概览、现有优势、具体问题清单（含段落定位与原文证据）与缺失事实。
                </p>
                <p className="mt-2 max-w-md text-xs leading-5 text-zinc-400">
                  诊断不会修改简历；优化建议逐条确认后才会生成新版本。
                </p>
                {error && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                  </div>
                )}
              </div>
            )}

            {step === 'diagnosing' && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">AI 正在诊断简历，约需 30~60 秒…</p>
              </div>
            )}

            {step === 'diagnosis' && diagnosis && (
              <div className="space-y-5">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                  <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">{diagnosis.overview}</p>
                </div>

                {diagnosis.strengths.length > 0 && (
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-green-600 dark:text-green-400">现有优势</h4>
                    <ul className="space-y-1">
                      {diagnosis.strengths.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" /> {s}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <h4 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    问题清单（{checkedIssues.size}/{diagnosis.issues.length} 已勾选，勾选的将用于优化）
                  </h4>
                  <div className="space-y-2">
                    {diagnosis.issues.map((issue, i) => {
                      const key = String(i);
                      const checked = checkedIssues.has(key);
                      return (
                        <label
                          key={key}
                          className={cn(
                            'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors',
                            checked
                              ? 'border-brand bg-brand-muted/40 dark:border-brand dark:bg-brand-muted/10'
                              : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleIssue(key)}
                            className="mt-1 h-4 w-4 shrink-0 accent-brand"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{issue.title}</span>
                              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                {issue.section}
                              </span>
                            </div>
                            <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-300">{issue.detail}</p>
                            {issue.evidence && (
                              <p className="mt-1 text-xs text-zinc-400">证据：{issue.evidence}</p>
                            )}
                            {issue.suggestion && (
                              <p className="mt-1 text-xs text-brand">建议：{issue.suggestion}</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <h4 className="mb-2 text-sm font-semibold text-amber-600 dark:text-amber-400">缺失事实（需人工确认补录）</h4>
                  {diagnosis.missing_facts.length > 0 ? (
                    <ul className="space-y-1">
                      {diagnosis.missing_facts.map((m, i) => (
                        <li key={i} className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> {m}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-zinc-400">无</p>
                  )}
                </section>

                <section>
                  <h4 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">优化方向（可多选）</h4>
                  <div className="flex flex-wrap gap-2">
                    {DIRECTIONS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleDirection(d.value)}
                        className={cn(
                          'cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors',
                          directions.includes(d.value)
                            ? 'border-brand bg-brand text-white'
                            : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300'
                        )}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <Label htmlFor="extra-instruction" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    额外要求（可选）
                  </Label>
                  <Input
                    id="extra-instruction"
                    value={extraInstruction}
                    onChange={(e) => setExtraInstruction(e.target.value)}
                    placeholder="如：突出数据量化结果"
                    className="mt-2"
                  />
                </section>
              </div>
            )}

            {step === 'optimizing' && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">AI 正在生成优化建议，约需 30~60 秒…</p>
              </div>
            )}

            {step === 'suggestions' && suggestions && (
              <div className="space-y-5">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                  <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">{suggestions.summary}</p>
                </div>

                <section>
                  <h4 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    逐条建议（{checkedSuggestionKeys.size}/{suggestions.suggestions.length} 已勾选）
                  </h4>
                  <div className="space-y-3">
                    {suggestions.suggestions.map((s, i) => {
                      const key = String(i);
                      const checked = checkedSuggestionKeys.has(key);
                      return (
                        <label
                          key={key}
                          className={cn(
                            'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors',
                            checked
                              ? 'border-brand bg-brand-muted/40 dark:border-brand dark:bg-brand-muted/10'
                              : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSuggestion(key)}
                            className="mt-1 h-4 w-4 shrink-0 accent-brand"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{s.section}</span>
                              {s.is_inference && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                                  含推断内容，请核对
                                </span>
                              )}
                            </div>
                            {s.original && (
                              <p className="mt-2 whitespace-pre-wrap rounded bg-red-50/70 px-2.5 py-2 text-xs leading-5 text-zinc-500 line-through decoration-red-300 dark:bg-red-950/30 dark:text-zinc-400">
                                {s.original}
                              </p>
                            )}
                            <p className="mt-1.5 whitespace-pre-wrap rounded bg-green-50/70 px-2.5 py-2 text-sm leading-5 text-zinc-800 dark:bg-green-950/30 dark:text-zinc-200">
                              {s.suggestion}
                            </p>
                            {s.reason && (
                              <p className="mt-1.5 text-xs text-zinc-400">理由：{s.reason}</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </section>

                {suggestions.notes.length > 0 && (
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-amber-600 dark:text-amber-400">提醒</h4>
                    <ul className="space-y-1">
                      {suggestions.notes.map((n, i) => (
                        <li key={i} className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> {n}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <Label htmlFor="version-label" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    新版本名称
                  </Label>
                  <Input
                    id="version-label"
                    value={versionLabel}
                    onChange={(e) => setVersionLabel(e.target.value)}
                    className="mt-2"
                  />
                  <p className="mt-1.5 text-xs text-zinc-400">确认后将生成独立新版本，当前原版不会被修改。</p>
                </section>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                  </div>
                )}
              </div>
            )}

            {step === 'applying' && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">正在生成新版本…</p>
              </div>
            )}

            {step === 'done' && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500 mb-4" />
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  新版本「{appliedLabel}」已生成
                </p>
                <p className="mt-2 max-w-md text-xs leading-5 text-zinc-400">
                  原版保留未变。可在简历库的版本列表中选择该新版本打开继续编辑。
                </p>
              </div>
            )}
          </ScrollArea>
        </div>

        {showFooter && (
          <DialogFooter className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
            {step === 'diagnosis' && (
              <>
                <Button variant="outline" onClick={() => setStep('start')} className="cursor-pointer">
                  返回
                </Button>
                <Button
                  onClick={handleOptimize}
                  disabled={checkedIssues.size === 0}
                  className="cursor-pointer bg-brand hover:bg-brand-hover"
                >
                  <Wand2 className="mr-1.5 h-4 w-4" />
                  生成优化建议
                </Button>
              </>
            )}
            {step === 'suggestions' && (
              <>
                <Button variant="outline" onClick={() => setStep('diagnosis')} className="cursor-pointer">
                  返回
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={checkedSuggestionKeys.size === 0}
                  className="cursor-pointer bg-brand hover:bg-brand-hover"
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  生成新版本
                </Button>
              </>
            )}
            {step === 'done' && (
              <Button onClick={() => onOpenChange(false)} className="cursor-pointer bg-brand hover:bg-brand-hover">
                完成
              </Button>
            )}
          </DialogFooter>
        )}

        {step === 'start' && (
          <DialogFooter className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">
              取消
            </Button>
            <Button onClick={handleDiagnose} disabled={!versionId} className="cursor-pointer bg-brand hover:bg-brand-hover">
              <Stethoscope className="mr-1.5 h-4 w-4" />
              开始 AI 诊断
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
