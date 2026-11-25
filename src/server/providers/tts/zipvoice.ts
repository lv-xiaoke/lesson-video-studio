import { readFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { SpeechJob, SpeechConfig } from '../../../shared/narration.ts';
import { ZIPVOICE_MODEL } from '../../../shared/narration.ts';
import { managedPath } from '../../storage/index.ts';
import { VoiceStore } from '../../voices/store.ts';
import { getStore } from '../../db/index.ts';
import { splitLocalText, wavInfo, pcmWav, adjustSpeech } from '../../voices/audio.ts';

function service() {
  const path = managedPath('zipvoice/service.json');
  if (!existsSync(path)) throw new Error('尚未安装本地模型，请先运行 ZipVoice 初始化脚本');
  const config = JSON.parse(readFileSync(path, 'utf8')) as { token: string; port: number };
  if (!config.token || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw new Error('本地配音服务配置不正确');
  return { url: `http://127.0.0.1:${config.port}`, token: config.token };
}
export function zipvoiceConfig(): SpeechConfig {
  try { service(); return { provider: 'zipvoice', model: ZIPVOICE_MODEL, configured: true, pricePer10k: 0 }; }
  catch { return { provider: 'zipvoice', model: ZIPVOICE_MODEL, configured: false, pricePer10k: 0, reason: '本地模型未安装或服务配置损坏，请运行初始化脚本并检查本机配置' }; }
}
export async function zipvoiceHealth(): Promise<SpeechConfig> {
  const config = zipvoiceConfig(); if (!config.configured) return config;
  try {
    const local = service(); const response = await fetch(local.url + '/health', { headers: { Authorization: `Bearer ${local.token}` }, signal: AbortSignal.timeout(2000) });
    const state = await response.json();
    if (!response.ok || !state.ready || state.model !== ZIPVOICE_MODEL) throw new Error();
    return config;
  } catch { return { ...config, configured: false, reason: '本地 ZipVoice 服务未启动或模型未就绪，请运行启动脚本' }; }
}
export async function synthesizeZipVoice(job: SpeechJob, voices = new VoiceStore(getStore())) {
  const voice = voices.get(job.voice.voiceId);
  if (!voice || !job.referenceHash || voice.hash !== job.referenceHash) throw new Error('音色资料缺失或已改变，请重新选择音色');
  const reference = await readFile(managedPath(voice.path));
  if (createHash('sha256').update(reference).digest('hex') !== voice.hash) throw new Error('参考录音校验失败，请重新上传音色');
  const local = service(); const pcm: Buffer[] = []; const deadline = Date.now() + 15 * 60_000; const signal = AbortSignal.timeout(15 * 60_000);
  try {
    for (const text of splitLocalText(job.text)) {
      if (!text.trim()) continue;
      signal.throwIfAborted();
      const response = await fetch(local.url + '/synthesize', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${local.token}` }, body: JSON.stringify({ text, referenceText: voice.referenceText, referenceAudio: reference.toString('base64'), timeoutSeconds: Math.max(.1, (deadline - Date.now()) / 1000) }), signal });
      if (!response.ok) throw new Error(response.status === 409 ? '本地引擎繁忙，请稍后重试' : '本地引擎生成失败，请检查本地服务日志');
      const audio = Buffer.from(await response.arrayBuffer()); pcm.push(wavInfo(audio).pcm);
    }
    signal.throwIfAborted();
    const audio = await adjustSpeech(pcmWav(Buffer.concat(pcm)), job.voice.speed, Math.max(1, deadline - Date.now()));
    signal.throwIfAborted();
    return { audio, durationSeconds: wavInfo(audio).durationSeconds, usageCharacters: Array.from(job.text).length, format: 'wav' as const };
  } catch (error) {
    if (signal.aborted) throw new Error('本地生成超过 15 分钟，任务已停止等待；请重启本地引擎后手动重试');
    if (error instanceof TypeError) throw new Error('无法连接本地配音服务，请运行启动脚本');
    throw error;
  }
}
