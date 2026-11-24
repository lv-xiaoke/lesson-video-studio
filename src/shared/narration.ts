import type { Scene } from './scene.ts';
export type VoiceSettings = { voiceId: string; speed: number };
export const DEFAULT_VOICE: VoiceSettings = { voiceId: 'male-qn-qingse', speed: 1 };
export const voiceOf = (scene: Scene): VoiceSettings => scene.voice || DEFAULT_VOICE;
export const narrationSignature = (scene: Scene) => JSON.stringify([scene.narration, voiceOf(scene).voiceId, voiceOf(scene).speed]);
export type AudioTrack = { sceneId: string; assetId: string; durationSeconds: number };
export type PreviewAudio = Record<string, { src: string; durationSeconds: number }>;
export type SpeechJob = {
  id: string; projectId: string; sceneId: string; version: number; signature: string;
  text: string; model: string; voice: VoiceSettings; pricePer10k: number | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed'; error: string | null; createdAt: string;
};
export type NarrationAsset = {
  id: string; projectId: string; sceneId: string; signature: string; model: string;
  durationSeconds: number; bytes: number; usageCharacters: number | null; estimatedCny: number | null;
  path: string; createdAt: string;
};
export type SpeechState = { assets: NarrationAsset[]; jobs: SpeechJob[] };
export type SpeechConfig = { configured: boolean; model: string; pricePer10k: number | null };
export function estimateSpeechCost(text: string, price: number | null) {
  return price === null ? null : Math.round(Array.from(text).length * price / 10_000 * 1_000_000) / 1_000_000;
}
