import type { SpeechConfig, SpeechJob } from '../../../shared/narration.ts';
export function speechConfig(): SpeechConfig {
  const raw = process.env.MINIMAX_PRICE_PER_10K_CHARS;
  const price = raw && raw.trim() ? Number(raw) : NaN;
  return { provider: 'minimax', configured: Boolean(process.env.MINIMAX_API_KEY?.trim()), model: process.env.MINIMAX_TTS_MODEL || 'speech-2.6-hd', pricePer10k: Number.isFinite(price) && price >= 0 ? price : null };
}
export function parseMiniMaxResult(raw: unknown) {
  const r = raw as { base_resp?: { status_code?: number }; data?: { audio?: string }; extra_info?: { audio_length?: number; usage_characters?: number } };
  if (!r || r.base_resp?.status_code !== 0) throw new Error(`MiniMax 合成失败（错误码 ${r?.base_resp?.status_code ?? '未知'}），请检查密钥、余额及音色；不会自动重试`);
  const length = r.extra_info?.audio_length;
  if (typeof length !== 'number' || !Number.isFinite(length) || length <= 0 || length > 1_800_000) throw new Error('MiniMax 返回的音频时长无效');
  const hex = r.data?.audio;
  if (typeof hex !== 'string' || hex.length < 256 || hex.length % 2 !== 0 || hex.length > 80_000_000 || !/^[a-fA-F0-9]+$/.test(hex)) throw new Error('MiniMax 没有返回有效音频');
  const usage = r.extra_info?.usage_characters;
  return { audio: Buffer.from(hex, 'hex'), durationSeconds: length / 1000, usageCharacters: typeof usage === 'number' && Number.isInteger(usage) && usage >= 0 ? usage : null };
}
export async function synthesize(job: SpeechJob) {
  const key = process.env.MINIMAX_API_KEY?.trim();
  if (!key) throw new Error('请先在 .env.local 配置 MINIMAX_API_KEY，再重启 Web 和 Worker');
  const endpoint = process.env.MINIMAX_TTS_ENDPOINT || 'https://api.minimax.cn/v1/t2a_v2';
  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model: job.model, text: job.text, stream: false, output_format: 'hex', voice_setting: { voice_id: job.voice.voiceId, speed: job.voice.speed, vol: 1, pitch: 0 }, audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }, subtitle_enable: false }) });
  } catch { throw new Error('配音请求中断或超时，请先检查厂商用量再决定是否重试；系统未自动再次调用'); }
  if (!response.ok) throw new Error(`MiniMax 请求失败（HTTP ${response.status}），请检查配置与服务状态`);
  try { return parseMiniMaxResult(await response.json()); }
  catch (error) { if (error instanceof SyntaxError) throw new Error('MiniMax 返回格式错误，请检查服务地址'); throw error; }
}
