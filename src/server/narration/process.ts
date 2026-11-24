import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SpeechJob } from '../../shared/narration.ts';
import { managedPath } from '../storage/index.ts';
import { synthesize } from '../providers/tts/minimax.ts';
import { SpeechStore } from './store.ts';
export async function processSpeechJob(job: SpeechJob, store: SpeechStore, provider = synthesize) {
  const result = await provider(job);
  const path = `projects/${job.projectId}/scenes/${job.sceneId}/narration/${job.id}.mp3`;
  await mkdir(dirname(managedPath(path)), { recursive: true });
  await writeFile(managedPath(path), result.audio, { flag: 'wx' });
  return store.complete(job.id, { path, durationSeconds: result.durationSeconds, bytes: result.audio.length, usageCharacters: result.usageCharacters });
}
