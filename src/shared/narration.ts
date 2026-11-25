import type { Scene } from './scene.ts';
export type VoiceSettings = { voiceId: string; speed: number };
export type SpeechProvider = 'minimax' | 'tencent' | 'zipvoice';
export const ZIPVOICE_MODEL = 'zipvoice-distill-int8-v1';
export const TENCENT_MODEL = 'tencent-basic-v1';
export const TENCENT_VOICES = [
  { id: '101001', name: '智瑜 · 情感女声' },
  { id: '101004', name: '智云 · 通用男声' },
  { id: '101011', name: '智燕 · 新闻女声' },
  { id: '101021', name: '智瑞 · 新闻男声' },
] as const;
export const providerForModel = (model: string): SpeechProvider => model === ZIPVOICE_MODEL ? 'zipvoice' : model === TENCENT_MODEL ? 'tencent' : 'minimax';
export const DEFAULT_VOICE: VoiceSettings = { voiceId: 'male-qn-qingse', speed: 1 };
export function voiceOf(scene: Scene, provider: SpeechProvider = 'minimax'): VoiceSettings {
  if (provider === 'zipvoice') return scene.voice || { voiceId: '', speed: 1 };
  const voice = scene.voice || DEFAULT_VOICE;
  if (provider === 'tencent') return {
    voiceId: voice.voiceId === 'unselected' ? 'unselected' : TENCENT_VOICES.some(v => v.id === voice.voiceId) ? voice.voiceId : '101001',
    speed: Math.max(0.6, voice.speed),
  };
  return { ...voice, voiceId: /^\d+$/.test(voice.voiceId) ? DEFAULT_VOICE.voiceId : voice.voiceId };
}
export const narrationSignature = (scene: Scene, provider: SpeechProvider = 'minimax') => {
  const voice = voiceOf(scene, provider);
  return JSON.stringify([scene.narration, voice.voiceId, voice.speed]);
};
export type AudioTrack = { sceneId: string; assetId: string; durationSeconds: number };
export type PreviewAudio = Record<string, { src: string; durationSeconds: number }>;
export type SpeechJob = {
  id: string; projectId: string; sceneId: string; version: number; signature: string;
  text: string; model: string; voice: VoiceSettings; pricePer10k: number | null;
  referenceHash?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed'; error: string | null; createdAt: string;
};
export type NarrationAsset = {
  id: string; projectId: string; sceneId: string; signature: string; model: string;
  durationSeconds: number; bytes: number; usageCharacters: number | null; estimatedCny: number | null;
  path: string; createdAt: string;
};
export type SpeechState = { assets: NarrationAsset[]; jobs: SpeechJob[] };
export type SpeechConfig = { provider: SpeechProvider; configured: boolean; model: string; pricePer10k: number | null; reason?: string };
export function canGenerateScenes(scenes: Scene[], ids: string[], config: SpeechConfig | null, activeVoiceIds: string[]) {
  if (!config) return false;
  return ids.every(id => { const scene = scenes.find(s => s.id === id); if (!scene) return false; const voice = voiceOf(scene, config.provider); return !!voice.voiceId && voice.voiceId !== 'unselected' && (config.provider !== 'zipvoice' || activeVoiceIds.includes(voice.voiceId)); });
}
export function estimateSpeechCost(text: string, price: number | null) {
  return price === null ? null : Math.round(Array.from(text).length * price / 10_000 * 1_000_000) / 1_000_000;
}
