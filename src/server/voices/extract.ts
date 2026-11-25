import { execFile } from 'node:child_process';
import { wavInfo, pcmWav } from './audio.ts';
import { VoiceImportError } from '../../shared/voice-import.ts';
export function mediaCommand(program: string, args: string[], limit = 2 * 1024 * 1024) {
  return new Promise<Buffer>((resolve, reject) => {
    execFile(program, args, { windowsHide: true, timeout: 60000, maxBuffer: limit, encoding: 'buffer' }, (error, stdout) => {
      if (error) reject(new VoiceImportError('媒体文件无法解码，或处理超时，请检查文件格式和 FFmpeg'));
      else resolve(stdout);
    });
  });
}
export async function extractReference(path: string, extension: string, start: number, duration: number) {
  const format = ({ mp4: 'mov', mov: 'mov', m4v: 'mov', webm: 'matroska', mkv: 'matroska', wav: 'wav', mp3: 'mp3' } as Record<string, string>)[extension];
  if (!format || !Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration < 3 || duration > 30) throw new VoiceImportError('媒体格式或片段范围不正确');
  const source = ['-protocol_whitelist', 'file,pipe', '-f', format, '-i', path];
  const result = JSON.parse((await mediaCommand('ffprobe', ['-v', 'error', ...source, '-show_entries', 'format=duration:stream=codec_type', '-of', 'json'])).toString());
  if (!result.streams?.some((s: { codec_type: string }) => s.codec_type === 'audio')) throw new VoiceImportError('视频没有可用音轨，请选择带声音的视频');
  const length = Number(result.format?.duration);
  if (Number.isFinite(length) && start + duration > length + .15) throw new VoiceImportError('所选片段超出媒体时长，请调整起始位置或时长');
  const wav = await mediaCommand('ffmpeg', ['-v', 'error', '-err_detect', 'explode', ...source.slice(0, -2), '-ss', String(start), '-i', path, '-t', String(duration), '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:1']);
  const info = wavInfo(wav);
  if (Math.abs(info.durationSeconds - duration) > .15) throw new VoiceImportError('所选范围没有完整音轨，请缩短片段或选择其他时间范围');
  if (info.durationSeconds < 3 || info.durationSeconds > 30) throw new VoiceImportError('提取出的声音不足 3 秒或超出 30 秒，请重新选取片段');
  let amplitude = 0; for (let pos = 0; pos < info.pcm.length; pos += 2) amplitude += Math.abs(info.pcm.readInt16LE(pos));
  if (amplitude / (info.pcm.length / 2) < 8) throw new VoiceImportError('所选片段几乎没有声音，请选择清晰讲话的片段');
  return pcmWav(info.pcm);
}
