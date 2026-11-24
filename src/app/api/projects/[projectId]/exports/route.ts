import { getStore } from '@/server/db';
import { errorResponse, localMutation } from '@/server/http';
import { SpeechStore } from '@/server/narration/store';
import { speechConfig } from '@/server/providers/tts/minimax';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, context: Context) { const { projectId } = await context.params; return Response.json(getStore().jobs(projectId)); }
export async function POST(request: Request, context: Context) {
  try {
    localMutation(request); const { projectId } = await context.params; const body = await request.json();
    if (body.includeAudio !== undefined && typeof body.includeAudio !== 'boolean') throw new Error('配音导出参数不正确');
    const audio = body.includeAudio === true ? new SpeechStore(getStore()).forExport(projectId, body.version, speechConfig().model) : [];
    return Response.json(getStore().enqueue(projectId, body.version, audio), { status: 202 });
  }
  catch (error) { return errorResponse(error); }
}
