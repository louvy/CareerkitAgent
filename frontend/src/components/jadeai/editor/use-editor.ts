'use client';

import { useCallback, useEffect } from 'react';
import { useResumeStore } from '@/components/jadeai/editor/resume-store';
import { useEditorStore } from '@/components/jadeai/editor/editor-store';
import type { ResumeSection } from '@/types/resume';
import { toJadeResume } from '@/components/jadeai/lib/adapter';
import { api } from '@/lib/api';

export function useEditor(resumeId: string) {
  const { setResume, setVersionId, sections, currentResume, updateSection, addSection, removeSection, reorderSections, reset: resetResume } = useResumeStore();
  const { pushSnapshot, reset: resetEditor } = useEditorStore();

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

  const handleUpdateSection = useCallback(
    (sectionId: string, content: any) => {
      pushSnapshot(sections);
      updateSection(sectionId, content);
    },
    [sections, pushSnapshot, updateSection]
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
