'use client';

import * as React from 'react';
import { useId } from 'react';
import type { Resume, ThemeConfig } from '@/types/resume';
import { BACKGROUND_TEMPLATES } from '@/lib/constants';
import dynamic from 'next/dynamic';

/**
 * 模板按需懒加载：50 个模板各自通过 next/dynamic 单独 code-split，
 * 仅当用户切换到对应模板时才加载其 JS，避免全部打进首屏包。
 * 模板内部的视觉/交互逻辑完全不变，仅把静态 import 改为动态 import。
 */
const templateLoading = () => (
  <div className="mx-auto max-w-[210mm] bg-white shadow-lg" style={{ minHeight: '297mm' }} />
);

interface ResumePreviewProps {
  resume: Resume;
}

const templateMap: Record<string, React.ComponentType<{ resume: Resume }>> = {
  classic: dynamic<{ resume: Resume }>(() => import('./templates/classic').then((m) => m.ClassicTemplate), { loading: templateLoading }),
  modern: dynamic<{ resume: Resume }>(() => import('./templates/modern').then((m) => m.ModernTemplate), { loading: templateLoading }),
  minimal: dynamic<{ resume: Resume }>(() => import('./templates/minimal').then((m) => m.MinimalTemplate), { loading: templateLoading }),
  professional: dynamic<{ resume: Resume }>(() => import('./templates/professional').then((m) => m.ProfessionalTemplate), { loading: templateLoading }),
  'two-column': dynamic<{ resume: Resume }>(() => import('./templates/two-column').then((m) => m.TwoColumnTemplate), { loading: templateLoading }),
  creative: dynamic<{ resume: Resume }>(() => import('./templates/creative').then((m) => m.CreativeTemplate), { loading: templateLoading }),
  ats: dynamic<{ resume: Resume }>(() => import('./templates/ats').then((m) => m.AtsTemplate), { loading: templateLoading }),
  academic: dynamic<{ resume: Resume }>(() => import('./templates/academic').then((m) => m.AcademicTemplate), { loading: templateLoading }),
  elegant: dynamic<{ resume: Resume }>(() => import('./templates/elegant').then((m) => m.ElegantTemplate), { loading: templateLoading }),
  executive: dynamic<{ resume: Resume }>(() => import('./templates/executive').then((m) => m.ExecutiveTemplate), { loading: templateLoading }),
  developer: dynamic<{ resume: Resume }>(() => import('./templates/developer').then((m) => m.DeveloperTemplate), { loading: templateLoading }),
  designer: dynamic<{ resume: Resume }>(() => import('./templates/designer').then((m) => m.DesignerTemplate), { loading: templateLoading }),
  startup: dynamic<{ resume: Resume }>(() => import('./templates/startup').then((m) => m.StartupTemplate), { loading: templateLoading }),
  formal: dynamic<{ resume: Resume }>(() => import('./templates/formal').then((m) => m.FormalTemplate), { loading: templateLoading }),
  infographic: dynamic<{ resume: Resume }>(() => import('./templates/infographic').then((m) => m.InfographicTemplate), { loading: templateLoading }),
  compact: dynamic<{ resume: Resume }>(() => import('./templates/compact').then((m) => m.CompactTemplate), { loading: templateLoading }),
  euro: dynamic<{ resume: Resume }>(() => import('./templates/euro').then((m) => m.EuroTemplate), { loading: templateLoading }),
  clean: dynamic<{ resume: Resume }>(() => import('./templates/clean').then((m) => m.CleanTemplate), { loading: templateLoading }),
  bold: dynamic<{ resume: Resume }>(() => import('./templates/bold').then((m) => m.BoldTemplate), { loading: templateLoading }),
  timeline: dynamic<{ resume: Resume }>(() => import('./templates/timeline').then((m) => m.TimelineTemplate), { loading: templateLoading }),
  // Batch 1
  nordic: dynamic<{ resume: Resume }>(() => import('./templates/nordic').then((m) => m.NordicTemplate), { loading: templateLoading }),
  corporate: dynamic<{ resume: Resume }>(() => import('./templates/corporate').then((m) => m.CorporateTemplate), { loading: templateLoading }),
  consultant: dynamic<{ resume: Resume }>(() => import('./templates/consultant').then((m) => m.ConsultantTemplate), { loading: templateLoading }),
  finance: dynamic<{ resume: Resume }>(() => import('./templates/finance').then((m) => m.FinanceTemplate), { loading: templateLoading }),
  medical: dynamic<{ resume: Resume }>(() => import('./templates/medical').then((m) => m.MedicalTemplate), { loading: templateLoading }),
  // Batch 2
  gradient: dynamic<{ resume: Resume }>(() => import('./templates/gradient').then((m) => m.GradientTemplate), { loading: templateLoading }),
  metro: dynamic<{ resume: Resume }>(() => import('./templates/metro').then((m) => m.MetroTemplate), { loading: templateLoading }),
  material: dynamic<{ resume: Resume }>(() => import('./templates/material').then((m) => m.MaterialTemplate), { loading: templateLoading }),
  coder: dynamic<{ resume: Resume }>(() => import('./templates/coder').then((m) => m.CoderTemplate), { loading: templateLoading }),
  blocks: dynamic<{ resume: Resume }>(() => import('./templates/blocks').then((m) => m.BlocksTemplate), { loading: templateLoading }),
  // Batch 3
  magazine: dynamic<{ resume: Resume }>(() => import('./templates/magazine').then((m) => m.MagazineTemplate), { loading: templateLoading }),
  artistic: dynamic<{ resume: Resume }>(() => import('./templates/artistic').then((m) => m.ArtisticTemplate), { loading: templateLoading }),
  retro: dynamic<{ resume: Resume }>(() => import('./templates/retro').then((m) => m.RetroTemplate), { loading: templateLoading }),
  neon: dynamic<{ resume: Resume }>(() => import('./templates/neon').then((m) => m.NeonTemplate), { loading: templateLoading }),
  watercolor: dynamic<{ resume: Resume }>(() => import('./templates/watercolor').then((m) => m.WatercolorTemplate), { loading: templateLoading }),
  // Batch 4
  swiss: dynamic<{ resume: Resume }>(() => import('./templates/swiss').then((m) => m.SwissTemplate), { loading: templateLoading }),
  japanese: dynamic<{ resume: Resume }>(() => import('./templates/japanese').then((m) => m.JapaneseTemplate), { loading: templateLoading }),
  berlin: dynamic<{ resume: Resume }>(() => import('./templates/berlin').then((m) => m.BerlinTemplate), { loading: templateLoading }),
  luxe: dynamic<{ resume: Resume }>(() => import('./templates/luxe').then((m) => m.LuxeTemplate), { loading: templateLoading }),
  rose: dynamic<{ resume: Resume }>(() => import('./templates/rose').then((m) => m.RoseTemplate), { loading: templateLoading }),
  // Batch 5
  architect: dynamic<{ resume: Resume }>(() => import('./templates/architect').then((m) => m.ArchitectTemplate), { loading: templateLoading }),
  legal: dynamic<{ resume: Resume }>(() => import('./templates/legal').then((m) => m.LegalTemplate), { loading: templateLoading }),
  teacher: dynamic<{ resume: Resume }>(() => import('./templates/teacher').then((m) => m.TeacherTemplate), { loading: templateLoading }),
  scientist: dynamic<{ resume: Resume }>(() => import('./templates/scientist').then((m) => m.ScientistTemplate), { loading: templateLoading }),
  engineer: dynamic<{ resume: Resume }>(() => import('./templates/engineer').then((m) => m.EngineerTemplate), { loading: templateLoading }),
  // Batch 6
  sidebar: dynamic<{ resume: Resume }>(() => import('./templates/sidebar').then((m) => m.SidebarTemplate), { loading: templateLoading }),
  card: dynamic<{ resume: Resume }>(() => import('./templates/card').then((m) => m.CardTemplate), { loading: templateLoading }),
  zigzag: dynamic<{ resume: Resume }>(() => import('./templates/zigzag').then((m) => m.ZigzagTemplate), { loading: templateLoading }),
  ribbon: dynamic<{ resume: Resume }>(() => import('./templates/ribbon').then((m) => m.RibbonTemplate), { loading: templateLoading }),
  mosaic: dynamic<{ resume: Resume }>(() => import('./templates/mosaic').then((m) => m.MosaicTemplate), { loading: templateLoading }),
};

const FONT_SIZE_SCALE: Record<string, { body: string; h1: string; h2: string; h3: string }> = {
  small:  { body: '12px', h1: '22px', h2: '15px', h3: '13px' },
  medium: { body: '14px', h1: '26px', h2: '17px', h3: '15px' },
  large:  { body: '16px', h1: '30px', h2: '19px', h3: '17px' },
};

const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#1a1a1a',
  accentColor: '#3b82f6',
  fontFamily: 'Inter',
  fontSize: 'medium',
  lineSpacing: 1.5,
  margin: { top: 20, right: 20, bottom: 20, left: 20 },
  sectionSpacing: 16,
  avatarStyle: 'oneInch',
};

/** Returns true if a hex colour is dark (luminance < 0.4) */
function isDark(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 0.4;
}

function buildThemeCSS(scopeId: string, theme: ThemeConfig, template: string): string {
  const s = `[data-theme-scope="${scopeId}"]`;
  const fs = FONT_SIZE_SCALE[theme.fontSize] || FONT_SIZE_SCALE.medium;
  const m = theme.margin;
  const needsPadding = !BACKGROUND_TEMPLATES.has(template);
  const primaryIsDark = isDark(theme.primaryColor);

  return `
    ${s} > div {
      font-family: ${theme.fontFamily}, 'Noto Sans SC', sans-serif !important;
      line-height: ${theme.lineSpacing} !important;
      ${needsPadding ? `padding-top: ${m.top}px !important; padding-right: ${m.right}px !important; padding-bottom: ${m.bottom}px !important; padding-left: ${m.left}px !important;` : ''}
      --base-body-size: ${fs.body};
      --base-h1-size: ${fs.h1};
      --base-h2-size: ${fs.h2};
      --base-h3-size: ${fs.h3};
      --base-line-spacing: ${theme.lineSpacing};
      --base-section-spacing: ${theme.sectionSpacing}px;
      --base-margin-top: ${m.top}px;
      --base-margin-right: ${m.right}px;
      --base-margin-bottom: ${m.bottom}px;
      --base-margin-left: ${m.left}px;
    }
    ${s} p, ${s} li, ${s} span, ${s} td, ${s} a, ${s} div {
      font-size: ${fs.body} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} h1:not([style*="color"]) {
      color: ${theme.primaryColor} !important;
      font-size: ${fs.h1} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} h1[style*="color"] {
      font-size: ${fs.h1} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} h2:not([style*="color"]) {
      color: ${theme.primaryColor} !important;
      font-size: ${fs.h2} !important;
      line-height: ${theme.lineSpacing} !important;
      border-color: ${theme.accentColor} !important;
    }
    ${s} h2[style*="color"] {
      font-size: ${fs.h2} !important;
      line-height: ${theme.lineSpacing} !important;
      border-color: ${theme.accentColor} !important;
    }
    ${s} h3:not([style*="color"]) {
      color: ${theme.primaryColor} !important;
      font-size: ${fs.h3} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} h3[style*="color"] {
      font-size: ${fs.h3} !important;
      line-height: ${theme.lineSpacing} !important;
    }
    ${s} [class*="border-b-2"],
    ${s} [class*="border-b-"] {
      border-color: ${theme.accentColor} !important;
    }
    ${s} [class*="bg-blue-"], ${s} [class*="bg-indigo-"],
    ${s} [class*="bg-slate-800"], ${s} [class*="bg-zinc-800"],
    ${s} [class*="bg-teal-"], ${s} [class*="bg-emerald-"] {
      background-color: ${theme.accentColor} !important;
    }
    ${s} [data-section] {
      ${needsPadding ? `margin-bottom: ${theme.sectionSpacing}px !important;` : `padding-bottom: ${theme.sectionSpacing}px !important;`}
    }
    ${primaryIsDark ? `
    ${s} [style*="background"][style*="#"] h1:not([style*="color"]),
    ${s} [style*="background"][style*="#"] h2:not([style*="color"]),
    ${s} [style*="background"][style*="#"] h3:not([style*="color"]),
    ${s} [style*="background"][style*="rgb"] h1:not([style*="color"]),
    ${s} [style*="background"][style*="rgb"] h2:not([style*="color"]),
    ${s} [style*="background"][style*="rgb"] h3:not([style*="color"]),
    ${s} [style*="background"][style*="linear-gradient"] h1:not([style*="color"]),
    ${s} [style*="background"][style*="linear-gradient"] h2:not([style*="color"]),
    ${s} [style*="background"][style*="linear-gradient"] h3:not([style*="color"]),
    ${s} .bg-black h1:not([style*="color"]),
    ${s} .bg-black h2:not([style*="color"]),
    ${s} .bg-black h3:not([style*="color"]) {
      color: #ffffff !important;
    }` : ''}
  `;
}

export function ResumePreview({ resume }: ResumePreviewProps) {
  const Template = templateMap[resume.template] || templateMap.classic;
  const scopeId = useId();
  const theme: ThemeConfig = { ...DEFAULT_THEME, ...(resume.themeConfig || {}) };

  // Defensive: ensure resume.sections is always an array (AI may return invalid/empty data)
  const safeResume = resume.sections ? resume : { ...resume, sections: [] };

  return (
    <>
      {/* Load the same Google Fonts used in PDF/HTML export so preview renders
          with identical font metrics (Inter for Latin, Noto Sans SC for CJK). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <div data-theme-scope={scopeId}>
        <style dangerouslySetInnerHTML={{ __html: buildThemeCSS(scopeId, theme, safeResume.template) }} />
        <Template resume={safeResume} />
      </div>
    </>
  );
}
