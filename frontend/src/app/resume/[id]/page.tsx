'use client';

import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useEditor } from '@/components/jadeai/editor/use-editor';
import { useEditorStore } from '@/components/jadeai/editor/editor-store';
import { useUIStore } from '@/components/jadeai/editor/ui-store';
import { EditorToolbar } from '@/components/jadeai/editor/editor-toolbar';
import { EditorSidebar } from '@/components/jadeai/editor/editor-sidebar';
import { EditorCanvas } from '@/components/jadeai/editor/editor-canvas';
import { EditorPreviewPanel } from '@/components/jadeai/editor/editor-preview-panel';
import { EditorMobileTabBar } from '@/components/jadeai/editor/editor-mobile-tab-bar';
import { ThemeEditor } from '@/components/jadeai/editor/theme-editor';
import { AiAssistantDialog } from '@/components/jadeai/editor/ai-assistant-dialog';
import { ExportDialog } from '@/components/jadeai/editor/export-dialog';
import { ImportDialog } from '@/components/jadeai/editor/import-dialog';
import { cn } from '@/lib/utils';

export default function ResumeEditPage() {
  const params = useParams<{ id: string }>();
  const resumeId = params.id;
  const { resume, sections, updateSection, addSection, removeSection, reorderSections } = useEditor(resumeId);
  const showThemeEditor = useEditorStore((s) => s.showThemeEditor);
  const mobileActiveTab = useEditorStore((s) => s.mobileActiveTab);
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);

  if (!resume) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <EditorToolbar />
      <EditorMobileTabBar />

      <div className="relative flex min-h-0 flex-1">
        {/* 侧栏：桌面常驻；移动端隐藏 */}
        <div className="max-md:hidden">
          <EditorSidebar
            sections={sections}
            onAddSection={addSection}
            onReorderSections={reorderSections}
          />
        </div>

        {/* 画布：移动端仅编辑 tab 显示（CSS 显隐而非卸载，保证预览 DOM 常驻供导出） */}
        <div className={cn('min-w-0 flex-1', mobileActiveTab === 'preview' && 'max-md:hidden')}>
          <EditorCanvas
            sections={sections}
            onUpdateSection={updateSection}
            onRemoveSection={removeSection}
            onReorderSections={reorderSections}
          />
        </div>

        {/* 预览：桌面常驻；移动端仅预览 tab 显示；md~lg 区间隐藏防止挤压编辑区 */}
        <div className={cn('hidden lg:block lg:w-[46%] lg:min-w-[430px] lg:shrink-0', mobileActiveTab === 'edit' && 'max-md:hidden')}>
          <EditorPreviewPanel />
        </div>

        {/* 主题：悬浮右侧覆盖，不占用 flex 宽度（避免挤压编辑区导致表单不可用） */}
        {showThemeEditor && (
          <div className="absolute inset-y-0 right-0 z-30 shadow-xl">
            <ThemeEditor />
          </div>
        )}
      </div>

      <ExportDialog
        open={activeModal === 'export'}
        onOpenChange={(o) => { if (!o) closeModal(); }}
        resumeId={resumeId}
      />
      <ImportDialog
        open={activeModal === 'import'}
        onOpenChange={(o) => { if (!o) closeModal(); }}
        resumeId={resumeId}
      />
      <AiAssistantDialog
        open={activeModal === 'ai-assistant'}
        onOpenChange={(o) => { if (!o) closeModal(); }}
      />
    </div>
  );
}
