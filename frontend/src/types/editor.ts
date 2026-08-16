import type { ResumeSection } from './resume';

/** 编辑器撤销/重做快照 */
export interface ResumeSnapshot {
  sections: ResumeSection[];
  timestamp: number;
}
