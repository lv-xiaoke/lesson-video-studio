import type { VoiceSettings } from './narration.ts';
export type SceneKind = 'title' | 'array' | 'summary' | 'steps' | 'comparison';
export type ComparisonContent = { leftTitle: string; leftPoints: string[]; rightTitle: string; rightPoints: string[] };
export const SCENE_LABELS: Record<SceneKind, string> = { title: '开场标题', array: '数组演示', summary: '知识总结', steps: '步骤讲解', comparison: '左右对比' };
export type Scene = {
  id: string;
  kind: SceneKind;
  title: string;
  content: string;
  narration: string;
  durationSeconds: number;
  voice?: VoiceSettings;
  comparison?: ComparisonContent;
};
