export const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
export class VoiceImportError extends Error {}
export function publicVoiceImportMessage(error: unknown) { return error instanceof VoiceImportError ? error.message : '媒体导入未完成，请检查文件和本机服务后重试'; }
export const MEDIA_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'wav', 'mp3'] as const;
export function parseMediaSelection(filename: unknown, start: unknown, duration: unknown) {
  if (typeof filename !== 'string' || !filename.trim() || filename.length > 255 || /[\\/\x00-\x1f]/.test(filename)) throw new VoiceImportError('文件名称不正确');
  const extension = filename.split('.').at(-1)?.toLowerCase();
  if (!MEDIA_EXTENSIONS.includes(extension as typeof MEDIA_EXTENSIONS[number])) throw new VoiceImportError('支持 MP4、MOV、M4V、WebM、MKV、WAV、MP3');
  if (typeof start !== 'number' || !Number.isFinite(start) || start < 0 || start > 7200 || typeof duration !== 'number' || !Number.isFinite(duration) || duration < 3 || duration > 30) throw new VoiceImportError('起始位置应为 0～7200 秒，片段时长应为 3～30 秒');
  return { filename, extension: extension!, start, duration };
}
export type VoiceImport = { id: string; filename: string; extension: string; start: number; duration: number; sourcePath: string; audioPath: string; status: 'queued' | 'running' | 'succeeded' | 'failed'; transcript: string | null; durationSeconds: number | null; hash: string | null; voiceId: string | null; savedReferenceText?: string; savedName?: string; error: string | null; createdAt: string };
export type AsrConfig = { configured: boolean; provider: 'sensevoice'; reason?: string };
export function voiceImportEditorValues(job: VoiceImport, local?: { name: string; text: string }) {
  const stored = { name: job.savedName || job.filename.replace(/\.[^.]+$/, '').slice(0, 40), text: job.savedReferenceText || job.transcript || '' };
  return job.voiceId ? stored : local || stored;
}
