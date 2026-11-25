import type { SpeechConfig, SpeechJob } from '../../../shared/narration.ts';
import { providerForModel, TENCENT_MODEL } from '../../../shared/narration.ts';
import { speechConfig as miniMaxConfig, synthesize as synthesizeMiniMax } from './minimax.ts';
import { synthesizeTencent } from './tencent.ts';
import { zipvoiceConfig, synthesizeZipVoice } from './zipvoice.ts';
import type { SpeechProvider } from '../../../shared/narration.ts';

export function speechConfig(selected?: SpeechProvider): SpeechConfig {
  const provider = selected || process.env.TTS_PROVIDER || 'tencent';
  if (provider === 'zipvoice') return zipvoiceConfig();
  if (provider === 'minimax') return miniMaxConfig();
  if (provider !== 'tencent') throw new Error('TTS_PROVIDER 必须是 tencent 或 minimax');
  return { provider, configured: Boolean(process.env.TENCENT_SECRET_ID?.trim() && process.env.TENCENT_SECRET_KEY?.trim()),
    model: TENCENT_MODEL, pricePer10k: null };
}

export type SynthesizedSpeech = { audio: Buffer; durationSeconds: number; usageCharacters: number | null; format?: 'wav' | 'mp3' };
export async function synthesize(job: SpeechJob): Promise<SynthesizedSpeech> {
  if (providerForModel(job.model) === 'zipvoice') return synthesizeZipVoice(job);
  // A queued job keeps its original provider even if the active configuration changes.
  return providerForModel(job.model) === 'tencent' ? synthesizeTencent(job) : synthesizeMiniMax(job);
}

export const audioContentType = (path: string) => path.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
