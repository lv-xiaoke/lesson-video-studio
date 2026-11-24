import type { Scene } from '../../shared/scene.ts';
export function buildTimeline(scenes: Scene[], fps = 30) {
  if (!Number.isInteger(fps) || fps <= 0) throw new Error('帧率必须为正整数');
  let from = 0;
  return scenes.map(scene => {
    if (!Number.isFinite(scene.durationSeconds) || scene.durationSeconds <= 0) throw new Error('小节时长必须大于零');
    const durationInFrames = Math.max(1, Math.round(scene.durationSeconds * fps));
    const entry = { scene, from, durationInFrames };
    from += durationInFrames;
    return entry;
  });
}
export function totalFrames(scenes: Scene[], fps = 30) {
  return buildTimeline(scenes, fps).reduce((total, entry) => total + entry.durationInFrames, 0);
}
