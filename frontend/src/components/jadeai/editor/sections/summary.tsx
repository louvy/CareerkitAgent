'use client';

import { useTranslations } from '@/components/jadeai/lib/i18n';
import { EditableRichText } from '../fields/editable-rich-text';
import type { ResumeSection, SummaryContent } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<SummaryContent>) => void;
}

export function SummarySection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as SummaryContent;

  return (
    <EditableRichText
      label={t('description')}
      value={content.text}
      onChange={(v) => onUpdate({ text: v })}
      rows={4}
    />
  );
}
