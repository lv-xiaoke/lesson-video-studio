import { spawn } from 'node:child_process';

export function splitLocalText(text: string): string[] {
  if (!text.trim() || Array.from(text).length > 3000) throw new Error('讲解文字应为 1～3000 字');
  const chunks: string[] = []; let current = '';
  for (const char of text) {
    current += char;
    if (Array.from(current).length >= 200 || /[。！？!?\n]/u.test(char)) { chunks.push(current); current = ''; }
  }
  if (current) chunks.push(current);
  return chunks;
}
export function wavInfo(wav: Buffer) {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('录音格式不是 WAV');
  let format = false;
  for (let pos = 12; pos + 8 <= wav.length;) {
    const kind = wav.toString('ascii', pos, pos + 4); const size = wav.readUInt32LE(pos + 4); const start = pos + 8;
    if (kind === 'fmt ' && size >= 16 && start + 16 <= wav.length) {
      format = wav.readUInt16LE(start) === 1 && wav.readUInt16LE(start + 2) === 1 && wav.readUInt32LE(start + 4) === 24000 && wav.readUInt16LE(start + 14) === 16;
    }
    if (kind === 'data') {
      if (!format) throw new Error('录音须为 24kHz 单声道 PCM16');
      const pcm = wav.subarray(start, Math.min(start + size, wav.length));
      if (!pcm.length || pcm.length % 2) throw new Error('录音数据不正确');
      return { pcm, durationSeconds: pcm.length / 48000 };
    }
    pos = start + size + (size % 2);
  }
  throw new Error('录音缺少声音数据');
}
export function pcmWav(pcm: Buffer) {
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
function ffmpeg(input: Buffer, options: string[], timeoutMs = 60000, inputFormat = 'wav') {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-err_detect', 'explode', '-f', inputFormat, '-i', 'pipe:0', ...options, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1'], { windowsHide: true });
    const chunks: Buffer[] = []; let size = 0; let settled = false;
    const fail = () => { if (!settled) { settled = true; reject(new Error('录音无法处理，请上传有效的 WAV 或 MP3，并检查 FFmpeg')); } child.kill(); };
    const timer = setTimeout(fail, Math.min(60000, timeoutMs));
    child.stdout.on('data', (part: Buffer) => { size += part.length; if (size > 128 * 1024 * 1024) fail(); else chunks.push(part); });
    child.stderr.resume(); child.stdin.on('error', () => {}); child.on('error', fail);
    child.on('close', code => { clearTimeout(timer); if (!settled) { settled = true; if (code !== 0) reject(new Error('录音无法解码，请检查文件内容')); else resolve(Buffer.concat(chunks)); } });
    child.stdin.end(input);
  });
}
export async function normalizeReference(input: Buffer) {
  if (!input.length || input.length > 10 * 1024 * 1024) throw new Error('录音文件大小应为 1 B～10 MB');
  const isWav = input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WAVE';
  const isMp3 = input.toString('ascii', 0, 3) === 'ID3' || (input[0] === 0xff && (input[1] & 0xe0) === 0xe0);
  if (!isWav && !isMp3) throw new Error('录音必须是实际 WAV 或 MP3 格式');
  if (isWav && input.readUInt32LE(4) + 8 !== input.length) throw new Error('WAV 录音不完整或已损坏');
  const wav = await ffmpeg(input, ['-vn', '-t', '30.1'], 60000, isWav ? 'wav' : 'mp3'); const info = wavInfo(wav);
  if (info.durationSeconds < 3 || info.durationSeconds > 30) throw new Error('参考录音需要 3～30 秒');
  return pcmWav(info.pcm);
}
export async function adjustSpeech(wav: Buffer, speed: number, timeoutMs = 60000) {
  if (!Number.isFinite(speed) || speed < .5 || speed > 2) throw new Error('语速应为 0.5～2 倍');
  return speed === 1 ? wav : pcmWav(wavInfo(await ffmpeg(wav, ['-vn', '-af', `atempo=${speed}`], timeoutMs)).pcm);
}
