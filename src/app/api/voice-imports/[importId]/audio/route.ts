import { getStore } from '@/server/db';
import { VoiceImportStore } from '@/server/voices/imports';
import { mediaResponse } from '@/server/storage/media';
import { voiceImportErrorResponse } from '@/server/voices/import-http';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await context.params; const job = new VoiceImportStore(getStore()).get(importId);
    if (!job) return Response.json({ error: '导入记录不存在' }, { status: 404 });
    if (job.status !== 'succeeded') return Response.json({ error: '提取尚未完成' }, { status: 409 });
    return mediaResponse(request, job.audioPath, 'audio/wav');
  } catch (error) { return voiceImportErrorResponse(error); }
}
