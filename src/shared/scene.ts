export type SceneKind = 'title' | 'array' | 'summary';
export type Scene = {
  id: string;
  kind: SceneKind;
  title: string;
  content: string;
  narration: string;
  durationSeconds: number;
};
