import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { VoicePreview } from '../../shared/voices.ts';
import { ZIPVOICE_MODEL } from '../../shared/narration.ts';
import { managedPath } from '../storage/index.ts';
import { synthesizeZipVoice } from '../providers/tts/zipvoice.ts';
import { VoiceStore } from './store.ts';
export async function processVoicePreview(job: VoicePreview, store: VoiceStore) {
  const voice = store.get(job.voiceId); if (!voice) throw new Error('音色不存在');
  const result = await synthesizeZipVoice({ id: job.id, projectId: '', sceneId: '', version: 0, signature: '', model: ZIPVOICE_MODEL, text: job.text, voice: { voiceId: job.voiceId, speed: 1 }, referenceHash: voice.hash, pricePer10k: 0, status: 'running', error: null, createdAt: job.createdAt }, store);
  const path = `voices/${job.voiceId}/previews/${job.id}.wav`;
  await mkdir(dirname(managedPath(path)), { recursive: true }); await writeFile(managedPath(path), result.audio, { flag: 'wx' });
  store.updatePreview({ ...job, status: 'succeeded', path, durationSeconds: result.durationSeconds });
}
