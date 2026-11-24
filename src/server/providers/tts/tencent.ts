import { createHash, createHmac, randomUUID } from 'node:crypto';
import { TENCENT_MODEL, TENCENT_VOICES } from '../../../shared/narration.ts';
import type { SpeechJob } from '../../../shared/narration.ts';

const HOST = 'tts.tencentcloudapi.com';
const SAMPLE_RATE = 16000;
const BYTE_RATE = SAMPLE_RATE * 2; // 16-bit mono PCM.
type Options = { secretId?: string; secretKey?: string; fetcher?: typeof fetch };

export function splitTencentText(text: string): string[] {
  if (!text.trim() || text.length > 3000) throw new Error('讲解应为 1～3000 字');
  const parts: string[] = [];
  let current = '';
  for (const char of text) {
    if ((current + char).length > 150 || Buffer.byteLength(current + char) > 450) {
      const breaks = [...current.matchAll(/[。！？；\n.!?;]/gu)];
      const last = breaks.at(-1)?.index;
      const cut = last !== undefined && last >= current.length / 2 ? last + 1 : current.length;
      parts.push(current.slice(0, cut)); current = current.slice(cut);
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

export function tencentSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed < 0.6 || speed > 2) throw new Error('腾讯云语速应为 0.6～2 倍');
  // Interpolate the documented speed anchors: -2=.6x, -1=.8x, 0=1x, 1=1.2x, 2=1.5x, 6=2.5x.
  return Math.round((speed <= 1.2 ? (speed - 1) / 0.2 : speed <= 1.5 ? 1 + (speed - 1.2) / 0.3 : 2 + (speed - 1.5) / 0.25) * 100) / 100;
}

export function tencentHeaders(payload: string, secretId: string, secretKey: string, timestamp = Math.floor(Date.now() / 1000)) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest();
  const contentType = 'application/json; charset=utf-8';
  const signed = 'content-type;host;x-tc-action';
  const canonical = `POST\n/\n\ncontent-type:${contentType}\nhost:${HOST}\nx-tc-action:texttovoice\n\n${signed}\n${hash(payload)}`;
  const scope = `${date}/tts/tc3_request`;
  const signingKey = hmac(hmac(hmac('TC3' + secretKey, date), 'tts'), 'tc3_request');
  const signature = createHmac('sha256', signingKey).update(`TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`).digest('hex');
  return {
    'Content-Type': contentType, Host: HOST,
    'X-TC-Action': 'TextToVoice', 'X-TC-Version': '2019-08-23', 'X-TC-Timestamp': String(timestamp),
    Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
  };
}

function endpoint() {
  const url = new URL(process.env.TENCENT_TTS_ENDPOINT || `https://${HOST}/`);
  const official = url.href === `https://${HOST}/`;
  const fixture = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/' && !url.search && !url.username && !url.password;
  if (!official && !fixture) throw new Error('腾讯云接入地址必须是官方地址；仅测试允许本机 HTTP 地址');
  return url.href;
}

function pcmFromResponse(raw: unknown): Buffer {
  const data = (raw as { Response?: { Error?: { Code?: unknown }; Audio?: unknown } } | null)?.Response;
  if (data?.Error) {
    const rawCode = data.Error.Code;
    const code = typeof rawCode === 'string' && /^[A-Za-z0-9.]{1,100}$/.test(rawCode) ? rawCode : 'Unknown';
    const hint = /PkgExhausted|NoFreeAccount|AccountArrears/.test(code) ? '资源包已耗尽、过期或账号欠费，请检查腾讯云控制台并保持后付费关闭'
      : /AuthFailure|Authorization|Unauthorized/.test(code) ? '请检查腾讯云密钥、子用户权限和电脑时间'
      : /ServerNotOpen|AppIdNotRegistered/.test(code) ? '请先在腾讯云控制台开通语音合成服务'
      : '请核对腾讯云服务状态、额度和音色';
    throw new Error(`${hint}（${code}）`);
  }
  const base64 = data?.Audio;
  if (typeof base64 !== 'string' || base64.length < 4 || base64.length > 16_000_000 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('腾讯云没有返回有效音频');
  const pcm = Buffer.from(base64, 'base64');
  if (!pcm.length || pcm.length % 2 !== 0 || pcm.subarray(0, 4).toString() === 'RIFF') throw new Error('腾讯云返回的 PCM 音频格式不正确');
  return pcm;
}

function wavFromPcm(pcm: Buffer) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(BYTE_RATE, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function synthesizeTencent(job: SpeechJob, options: Options = {}) {
  const secretId = (options.secretId ?? process.env.TENCENT_SECRET_ID)?.trim();
  const secretKey = (options.secretKey ?? process.env.TENCENT_SECRET_KEY)?.trim();
  if (!secretId || !secretKey) throw new Error('请先在 .env.local 配置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY，再重启 Web 和 Worker');
  if (job.model !== TENCENT_MODEL || !TENCENT_VOICES.some(v => v.id === job.voice.voiceId)) throw new Error('腾讯云当前仅支持列表中的精品音色');
  const speed = tencentSpeed(job.voice.speed);
  const parts = splitTencentText(job.text);
  const url = endpoint();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for (const [index, text] of parts.entries()) {
    try {
      // PCM is joined before adding a single WAV header, so long narration has one valid audio timeline.
      const payload = JSON.stringify({ Text: text, SessionId: randomUUID(), VoiceType: Number(job.voice.voiceId),
        Speed: speed, Volume: 0, ModelType: 1, PrimaryLanguage: 1, SampleRate: SAMPLE_RATE, Codec: 'pcm' });
      let response: Response;
      try {
        response = await (options.fetcher || fetch)(url, { method: 'POST', headers: tencentHeaders(payload, secretId, secretKey),
          body: payload, signal: AbortSignal.timeout(120_000), redirect: 'error' });
      } catch { throw new Error('请求中断或超时，请核对腾讯云用量后决定是否重试；不会自动重试'); }
      if (!response.ok) throw new Error(`腾讯云请求失败（HTTP ${response.status}）`);
      let raw: unknown;
      try { raw = await response.json(); } catch { throw new Error('腾讯云返回格式错误'); }
      const pcm = pcmFromResponse(raw);
      totalBytes += pcm.length;
      if (totalBytes > BYTE_RATE * 1800) throw new Error('腾讯云返回的音频时长超过 30 分钟');
      chunks.push(pcm);
    } catch (error) {
      throw new Error(`腾讯云第 ${index + 1}/${parts.length} 段合成失败：${error instanceof Error ? error.message : '返回异常'}。已完成的请求可能已扣减额度，后续分段已停止，不会自动重试。`);
    }
  }
  return { audio: wavFromPcm(Buffer.concat(chunks)), durationSeconds: totalBytes / BYTE_RATE, usageCharacters: null, format: 'wav' as const };
}
