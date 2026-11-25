import { getStore } from '@/server/db';
import { VoiceStore } from '@/server/voices/store';
import { mediaResponse } from '@/server/storage/media';
import { errorResponse } from '@/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ voiceId: string; previewId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { voiceId, previewId } = await context.params; const job = new VoiceStore(getStore()).getPreview(voiceId, previewId);
    if (!job) return Response.json({ error: '试听任务不存在' }, { status: 404 });
    if (new URL(request.url).searchParams.get('audio') === '1') {
      if (job.status !== 'succeeded' || !job.path) return Response.json({ error: '试听尚未完成' }, { status: 409 });
      return mediaResponse(request, job.path, 'audio/wav');
    }
    return Response.json({ ...job, path: '' });
  } catch (error) { return errorResponse(error); }
}
