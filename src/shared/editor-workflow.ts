import type { Scene } from './scene.ts';
import type { Lesson } from './lesson.ts';
import { narrationSignature } from './narration.ts';
import type { SpeechConfig, SpeechState } from './narration.ts';

export const SPEECH_STATUS = { loading: '读取中', missing: '未配音', queued: '等待配音', running: '生成中', ready: '已配音', stale: '需更新', failed: '配音失败' };
export type SceneSpeechStatus = keyof typeof SPEECH_STATUS;
export function sceneSpeechStatus(scene: Scene, speech: SpeechState, config: SpeechConfig | null): SceneSpeechStatus {
  if (!config) return 'loading';
  const signature = narrationSignature(scene, config.provider);
  const matches = (item: { sceneId: string; signature: string; model: string }) => item.sceneId === scene.id && item.signature === signature && item.model === config.model;
  const pending = speech.jobs.find(job => matches(job) && (job.status === 'queued' || job.status === 'running'));
  if (pending) return pending.status === 'running' ? 'running' : 'queued';
  if (speech.assets.some(matches)) return 'ready';
  if (speech.jobs.find(matches)?.status === 'failed') return 'failed';
  return speech.assets.some(item => item.sceneId === scene.id) ? 'stale' : 'missing';
}
export function exportReadiness(lesson: Lesson, readySceneIds: string[], includeAudio: boolean) {
  const ready = new Set(readySceneIds);
  const missing = lesson.scenes.filter(scene => !ready.has(scene.id));
  return { missing, ready: !includeAudio || missing.length === 0 };
}
