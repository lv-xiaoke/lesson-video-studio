import type { Lesson } from './lesson.ts';
export type AiInput = { kind: 'lesson'; topic: string; audience: string; targetSeconds: number } | { kind: 'scene'; sceneId: string; instruction: string };
export type AiConfig = { provider: 'deepseek'; configured: boolean; model: string };
export type AiUsage = { promptTokens: number; completionTokens: number };
export type AiStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'applied' | 'undone' | 'discarded';
export type AiJob = {
  id: string; projectId: string; baseVersion: number; model: string; input: AiInput; sourceLesson: Lesson;
  status: AiStatus; result: Lesson | null; error: string | null; usage: AiUsage | null;
  appliedVersion: number | null; undoneVersion: number | null; createdAt: string;
};
