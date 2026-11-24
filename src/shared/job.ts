import type { Lesson } from './lesson.ts';
export type Job = {
  id: string; projectId: string; version: number; lesson: Lesson;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number; output: string | null; error: string | null;
  createdAt: string; updatedAt: string;
};
