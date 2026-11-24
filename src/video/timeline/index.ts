import type { Scene } from '../../shared/scene.ts';
import type { PreviewAudio } from '../../shared/narration.ts';
export function buildTimeline(scenes: Scene[], fps = 30, audio: PreviewAudio = {}) {
  if (!Number.isInteger(fps) || fps <= 0) throw new Error('帧率必须为正整数');
  let from = 0;
  return scenes.map(scene => {
    if (!Number.isFinite(scene.durationSeconds) || scene.durationSeconds <= 0) throw new Error('小节时长必须大于零');
    const spoken = audio[scene.id]?.durationSeconds;
    if (spoken !== undefined && (!Number.isFinite(spoken) || spoken <= 0)) throw new Error('配音时长不正确');
    const milliseconds = spoken === undefined ? scene.durationSeconds * 1000 : Math.max(3000, Math.round(spoken * 1000) + 350);
    const durationInFrames = Math.max(1, Math.round(milliseconds * fps / 1000));
    const entry = { scene, from, durationInFrames };
    from += durationInFrames;
    return entry;
  });
}
export function totalFrames(scenes: Scene[], fps = 30, audio: PreviewAudio = {}) {
  return buildTimeline(scenes, fps, audio).reduce((total, entry) => total + entry.durationInFrames, 0);
}
