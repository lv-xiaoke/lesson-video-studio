import { VoiceImportError } from '../../shared/voice-import.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { AsrConfig, VoiceImport } from '../../shared/voice-import.ts';
import { localVoiceService } from '../providers/tts/zipvoice.ts';
import { managedPath } from '../storage/index.ts';
import { extractReference } from './extract.ts';
import { wavInfo } from './audio.ts';
import { VoiceImportStore } from './imports.ts';
export async function asrConfig(): Promise<AsrConfig> {
  try {
    const local = localVoiceService(); const response = await fetch(local.url + '/health', { headers: { Authorization: `Bearer ${local.token}` }, signal: AbortSignal.timeout(2000) });
    const state = await response.json();
    if (!response.ok || !state.asrReady) return { provider: 'sensevoice', configured: false, reason: '本地识别模型未就绪，请运行初始化脚本后重启本地引擎' };
    return { provider: 'sensevoice', configured: true };
  } catch { return { provider: 'sensevoice', configured: false, reason: '无法连接本地识别服务，请启动本地引擎' }; }
}
export async function recognizeReference(audio: Buffer) {
  const local = localVoiceService();
  try {
    const response = await fetch(local.url + '/transcribe', { method: 'POST', headers: { Authorization: `Bearer ${local.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: audio.toString('base64'), timeoutSeconds: 120 }), signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new VoiceImportError(response.status === 409 ? '本地引擎正在工作，请稍后重新导入' : '自动识别失败，请检查识别模型或选择更清晰的片段');
    const data = await response.json();
    if (typeof data.text !== 'string' || !data.text.trim() || Array.from(data.text).length > 1000) throw new VoiceImportError('没有识别到有效讲话，请选择单人清晰讲话的片段');
    return data.text.trim();
  } catch (error) { if (error instanceof TypeError || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))) throw new VoiceImportError('本地识别服务中断或超时，请等待引擎恢复后重新导入'); throw error; }
}
export async function processVoiceImport(job: VoiceImport, store: VoiceImportStore) {
  const audio = await extractReference(managedPath(job.sourcePath), job.extension, job.start, job.duration);
  const transcript = await recognizeReference(audio);
  await mkdir(dirname(managedPath(job.audioPath)), { recursive: true }); await writeFile(managedPath(job.audioPath), audio, { flag: 'wx' });
  store.complete(job.id, { transcript, durationSeconds: wavInfo(audio).durationSeconds, hash: createHash('sha256').update(audio).digest('hex') });
}
