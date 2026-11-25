import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { MAX_MEDIA_BYTES, VoiceImportError } from '../../shared/voice-import.ts';
export async function writeMediaUpload(request: Request, path: string, limit = MAX_MEDIA_BYTES) {
  if (!request.body) throw new VoiceImportError('上传文件为空');
  await mkdir(dirname(path), { recursive: true }); const file = await open(path, 'wx');
  const reader = request.body.getReader(); let size = 0; let succeeded = false;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      if (size + value.length > limit) { await reader.cancel(); throw new VoiceImportError('上传文件超出大小限制，最大 200 MB'); }
      let offset = 0;
      while (offset < value.length) { const { bytesWritten } = await file.write(value.subarray(offset)); if (!bytesWritten) throw new VoiceImportError('文件写入中断'); offset += bytesWritten; }
      size += value.length;
    }
    if (!size) throw new VoiceImportError('上传文件为空');
    succeeded = true; return size;
  } finally { await file.close(); reader.releaseLock(); if (!succeeded) await unlink(path).catch(() => { console.error('本次上传的临时文件清理失败'); }); }
}
