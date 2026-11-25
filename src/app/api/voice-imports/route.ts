import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { getStore } from '@/server/db';
import { VoiceImportStore } from '@/server/voices/imports';
import { writeMediaUpload } from '@/server/voices/upload';
import { asrConfig } from '@/server/voices/transcribe';
import { managedPath } from '@/server/storage';
import { localMutation } from '@/server/http';
import { voiceImportErrorResponse } from '@/server/voices/import-http';
import { MAX_MEDIA_BYTES, parseMediaSelection, VoiceImportError } from '@/shared/voice-import';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(new VoiceImportStore(getStore()).list().map(job => ({ ...job, sourcePath: '', audioPath: '' }))); }
export async function POST(request: Request) {
  let uploadedPath: string | undefined;
  try {
    localMutation(request, MAX_MEDIA_BYTES);
    const params = new URL(request.url).searchParams;
    if (!params.has('start') || !params.has('duration')) throw new Error('请选择片段起始位置和时长');
    const selection = parseMediaSelection(params.get('filename'), Number(params.get('start')), Number(params.get('duration')));
    const store = new VoiceImportStore(getStore()); store.ensureCapacity();
    const config = await asrConfig(); if (!config.configured) throw new VoiceImportError(config.reason);
    const id = randomUUID();
    await writeMediaUpload(request, managedPath(`voice-imports/${id}/source.${selection.extension}`));
    uploadedPath = managedPath(`voice-imports/${id}/source.${selection.extension}`);
    const job = store.create(selection, id);
    return Response.json({ ...job, sourcePath: '', audioPath: '' }, { status: 202 });
  } catch (error) { if (uploadedPath) await unlink(uploadedPath).catch(() => { console.error('本次未入队上传清理失败'); }); return voiceImportErrorResponse(error); }
}
