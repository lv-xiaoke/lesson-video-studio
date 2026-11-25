import type { AiJob } from './ai.ts';
export function currentAiDraft(jobs: AiJob[], selectedId?: string | null): AiJob | undefined {
  const visible = jobs.filter(job => job.status !== 'discarded');
  return visible.find(job => job.id === selectedId) || visible[0];
}
export function draftActionState(job: AiJob, projectVersion: number, dirty: boolean): { canApply: boolean; canUndo: boolean; reason: string | null } {
  const relevant = job.status === 'succeeded' || job.status === 'applied';
  if (relevant && dirty) return { canApply: false, canUndo: false, reason: '当前有未保存修改，请先处理编辑内容，再决定是否应用或撤销。' };
  if (job.status === 'succeeded' && job.result) return projectVersion === job.baseVersion
    ? { canApply: true, canUndo: false, reason: null }
    : { canApply: false, canUndo: false, reason: '课程版本已修改，这份草稿不能直接覆盖当前内容。可以查看后重新生成。' };
  if (job.status === 'applied') return projectVersion === job.appliedVersion
    ? { canApply: false, canUndo: true, reason: null }
    : { canApply: false, canUndo: false, reason: '应用后课程已有修改，不能撤销这次应用。' };
  return { canApply: false, canUndo: false, reason: null };
}
