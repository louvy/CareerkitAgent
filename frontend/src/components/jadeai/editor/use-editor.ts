'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useResumeStore } from '@/components/jadeai/editor/resume-store';
import { useEditorStore } from '@/components/jadeai/editor/editor-store';
import type { ResumeSection } from '@/types/resume';
import { toJadeResume } from '@/components/jadeai/lib/adapter';
import { api } from '@/lib/api';

export function useEditor(resumeId: string) {
  const { setResume, setVersionId, sections, currentResume, updateSection, addSection, removeSection, reorderSections, reset: resetResume } = useResumeStore();
  const { pushSnapshot, reset: resetEditor } = useEditorStore();

  // 撤销快照防抖：连续打字时只在“第一次”改动前记录状态，空闲 500ms 后才真正
  // 入栈，把一个输入连击合并成单次撤销步骤（避免每次按键都塞满 undo 栈）。
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushSnapshotDebounced = useCallback(
    (preEditSections: ResumeSection[]) => {
      if (snapshotTimer.current) return;
      snapshotTimer.current = setTimeout(() => {
        pushSnapshot(preEditSections);
        snapshotTimer.current = null;
      }, 500);
    },
    [pushSnapshot]
  );

  const loadResume = useCallback(async () => {
    try {
      const data = await api.getResume(Number(resumeId));
      if (data.versions.length > 0) {
        const last = data.versions[data.versions.length - 1];
        setVersionId(last.id);
        setResume(toJadeResume(last.content));
      }
    } catch (error) {
      console.error('Failed to load resume:', error);
    }
  }, [resumeId, setResume, setVersionId]);

  useEffect(() => {
    loadResume();
    return () => {
      resetResume();
      resetEditor();
    };
  }, [loadResume, resetResume, resetEditor]);

  // 卸载时清理未触发的快照定时器，避免向已卸载的 store 写入。
  useEffect(() => {
    return () => {
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    };
  }, []);

  const handleUpdateSection = useCallback(
    (sectionId: string, content: any) => {
      pushSnapshotDebounced(sections);
      updateSection(sectionId, content);
    },
    [sections, pushSnapshotDebounced, updateSection]
  );

  const handleAddSection = useCallback(
    (section: ResumeSection) => {
      pushSnapshot(sections);
      addSection(section);
    },
    [sections, pushSnapshot, addSection]
  );

  const handleRemoveSection = useCallback(
    (sectionId: string) => {
      pushSnapshot(sections);
      removeSection(sectionId);
    },
    [sections, pushSnapshot, removeSection]
  );

  const handleReorder = useCallback(
    (newSections: ResumeSection[]) => {
      pushSnapshot(sections);
      reorderSections(newSections);
    },
    [sections, pushSnapshot, reorderSections]
  );

  return {
    resume: currentResume,
    sections,
    updateSection: handleUpdateSection,
    addSection: handleAddSection,
    removeSection: handleRemoveSection,
    reorderSections: handleReorder,
    loadResume,
  };
}
