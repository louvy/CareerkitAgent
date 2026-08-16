'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from '@/components/jadeai/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/jadeai/ui/dialog';
import { Button } from '@/components/jadeai/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/jadeai/ui/tooltip';
import { useResumeStore } from '@/components/jadeai/editor/resume-store';
import { EXPORT_TAILWIND_CSS } from '@/components/jadeai/export-css';
import { api } from '@/lib/api';
import {
  FileDown,
  FileText,
  Globe,
  AlignLeft,
  Braces,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
}

type ExportFormat = 'pdf' | 'pdf-one-page' | 'docx' | 'html' | 'txt' | 'json';
type ExportState = 'idle' | 'exporting' | 'success' | 'error';

const FORMAT_OPTIONS: {
  value: ExportFormat;
  icon: typeof FileDown;
  labelKey: string;
  descKey: string;
  tooltipKey?: string;
}[] = [
  { value: 'pdf', icon: FileDown, labelKey: 'pdf', descKey: 'pdfDescription' },
  { value: 'pdf-one-page', icon: Sparkles, labelKey: 'pdfOnePage', descKey: 'pdfOnePageDescription', tooltipKey: 'pdfOnePageTooltip' },
  { value: 'docx', icon: FileText, labelKey: 'docx', descKey: 'docxDescription' },
  { value: 'html', icon: Globe, labelKey: 'html', descKey: 'htmlDescription' },
  { value: 'txt', icon: AlignLeft, labelKey: 'txt', descKey: 'txtDescription' },
  { value: 'json', icon: Braces, labelKey: 'json', descKey: 'jsonDescription' },
];

// ---------- 本地导出工具 ----------
// 本项目的后端仅提供 Word 导出，其余格式（html/txt/json）在前端生成；
// PDF 通过 iframe 加载本地生成的 HTML 后调起浏览器打印（可另存为 PDF）。

/** 组装独立可打印的 HTML 文档：抓取实时预览 DOM + Tailwind 编译 CSS + 主题样式 */
function buildExportHtml(): string {
  const scope = document.querySelector('[data-theme-scope]');
  const body = scope ? scope.outerHTML : '';
  const title = useResumeStore.getState().currentResume?.title || 'resume';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>${EXPORT_TAILWIND_CSS}</style>
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  @page { size: A4; margin: 0; }
</style>
</head>
<body>${body}</body>
</html>`;
}

/** 结构化纯文本导出 */
function buildExportTxt(): string {
  const { currentResume, sections } = useResumeStore.getState();
  if (!currentResume) return '';
  const lines: string[] = [];
  for (const s of sections) {
    if (!s.visible) continue;
    lines.push(s.title, '');
    const c = s.content as any;
    switch (s.type) {
      case 'personal_info': {
        const fields: [string, string | undefined][] = [
          ['姓名', c.fullName], ['职位', c.jobTitle], ['邮箱', c.email], ['电话', c.phone],
          ['所在地', c.location], ['网站', c.website], ['GitHub', c.github], ['LinkedIn', c.linkedin],
        ];
        for (const [k, v] of fields) if (v) lines.push(`${k}: ${v}`);
        break;
      }
      case 'summary':
        if (c.text) lines.push(c.text);
        break;
      case 'work_experience':
      case 'education':
      case 'projects':
      case 'certifications':
      case 'languages':
      case 'custom': {
        for (const item of (c.items || [])) {
          const main = item.company || item.institution || item.name || item.language || item.title || '';
          const dates = [item.startDate, item.endDate].filter(Boolean).join(' - ');
          lines.push(`- ${main}${dates ? ` (${dates})` : ''}`);
          const sub = item.position || item.degree || item.issuer || item.proficiency || '';
          if (sub) lines.push(`  ${sub}${item.field ? ' · ' + item.field : ''}`);
          if (item.description) lines.push(`  ${item.description}`);
          if (Array.isArray(item.highlights)) for (const h of item.highlights) lines.push(`  · ${h}`);
          if (Array.isArray(item.technologies) && item.technologies.length) lines.push(`  技术: ${item.technologies.join(', ')}`);
        }
        break;
      }
      case 'skills':
        for (const cat of (c.categories || [])) {
          lines.push(`- ${cat.name}: ${(cat.skills || []).join('、')}`);
        }
        break;
      case 'github':
        for (const item of (c.items || [])) {
          lines.push(`- ${item.name || item.repoUrl}${item.stars ? ` ★${item.stars}` : ''}${item.language ? ` [${item.language}]` : ''}`);
          if (item.description) lines.push(`  ${item.description}`);
        }
        break;
    }
    lines.push('');
  }
  return lines.join('\n');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function timestampSuffix(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function ExportDialog({ open, onOpenChange, resumeId }: ExportDialogProps) {
  const t = useTranslations('export');
  const { currentResume, isDirty, save } = useResumeStore();

  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [state, setState] = useState<ExportState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [canPrintFallback, setCanPrintFallback] = useState(false);

  useEffect(() => {
    if (open) {
      setState('idle');
      setErrorMessage('');
      setSelectedFormat('pdf');
      setCanPrintFallback(false);
    }
  }, [open]);

  /** 浏览器打印：iframe 加载本地 HTML 后调起打印对话框，可另存为 PDF */
  const handlePrint = useCallback(() => {
    const html = buildExportHtml();
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      // 给 Web 字体一点加载时间后再打印
      setTimeout(() => {
        win.focus();
        win.print();
        setTimeout(() => iframe.remove(), 60_000);
      }, 400);
    };
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  }, []);

  const handleExport = useCallback(async () => {
    setState('exporting');
    setErrorMessage('');
    setCanPrintFallback(false);

    try {
      const store = useResumeStore.getState();
      const resume = store.currentResume;
      if (!resume) throw new Error(t('error'));

      const ts = timestampSuffix();
      const base = (resume.title || 'resume').replace(/[\\/:*?"<>|]/g, '_');

      if (selectedFormat === 'docx') {
        // Word 走后端导出接口（先保存，确保导出的是最新内容）
        if (store.isDirty) await store.save();
        const { versionId } = useResumeStore.getState();
        if (!versionId) throw new Error(t('error'));
        const { url } = await api.exportVersion(versionId);
        window.open(url, '_blank');
      } else if (selectedFormat === 'html') {
        downloadBlob(new Blob([buildExportHtml()], { type: 'text/html;charset=utf-8' }), `${base}-${ts}.html`);
      } else if (selectedFormat === 'txt') {
        downloadBlob(new Blob([buildExportTxt()], { type: 'text/plain;charset=utf-8' }), `${base}-${ts}.txt`);
      } else if (selectedFormat === 'json') {
        const data = { ...resume, sections: store.sections };
        downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), `${base}-${ts}.json`);
      } else {
        // pdf / pdf-one-page：本地 HTML + 浏览器打印（关闭对话框后再调起打印）
        onOpenChange(false);
        setTimeout(handlePrint, 100);
        return;
      }

      setState('success');
      setTimeout(() => onOpenChange(false), 1500);
    } catch (err) {
      setState('error');
      setErrorMessage(err instanceof Error ? err.message : t('error'));
      // 仅 PDF 格式提供打印兜底
      setCanPrintFallback(selectedFormat === 'pdf' || selectedFormat === 'pdf-one-page');
    }
  }, [selectedFormat, isDirty, save, onOpenChange, t, handlePrint]);

  const isLoading = state === 'exporting';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isLoading) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          {state === 'idle' && (
            <TooltipProvider>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {FORMAT_OPTIONS.map((format) => {
                  const Icon = format.icon;
                  const isSelected = selectedFormat === format.value;
                  const card = (
                    <button
                      key={format.value}
                      onClick={() => setSelectedFormat(format.value)}
                      className={`cursor-pointer flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-all duration-150 hover:border-brand hover:bg-brand-muted/50 dark:hover:border-brand dark:hover:bg-brand-muted/20 ${
                        isSelected
                          ? 'border-brand bg-brand-muted dark:border-brand dark:bg-brand-muted'
                          : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900'
                      }`}
                    >
                      <Icon className={`h-6 w-6 ${isSelected ? 'text-brand' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      <span className={`text-sm font-medium ${isSelected ? 'text-brand dark:text-brand' : 'text-zinc-700 dark:text-zinc-300'}`}>
                        {t(format.labelKey)}
                      </span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        {t(format.descKey)}
                      </span>
                    </button>
                  );
                  if (format.tooltipKey) {
                    return (
                      <Tooltip key={format.value}>
                        <TooltipTrigger asChild>{card}</TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={6}>
                          {t(format.tooltipKey)}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  return card;
                })}
              </div>
            </TooltipProvider>
          )}

          {state === 'exporting' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('exporting')}
              </p>
            </div>
          )}

          {state === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500 mb-3" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('success')}
              </p>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                {errorMessage || t('error')}
              </p>
              {canPrintFallback && (
                <>
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {t('pdfFailedHint')}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => { onOpenChange(false); setTimeout(handlePrint, 100); }}
                    className="mt-3 cursor-pointer gap-1.5"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    {t('printFallback')}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          {(state === 'idle' || state === 'error') && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="cursor-pointer"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={handleExport}
                disabled={isLoading}
                className="cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {t('export')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
