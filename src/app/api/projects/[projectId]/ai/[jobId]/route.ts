import { getStore } from '@/server/db';
import { AiStore } from '@/server/ai/store';
import { errorResponse, localMutation } from '@/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ projectId: string; jobId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    localMutation(request);
    const { projectId, jobId } = await context.params; const body = await request.json();
    const store = new AiStore(getStore());
    if (body.action === 'apply') return Response.json(store.apply(projectId, jobId, body.version));
    if (body.action === 'undo') return Response.json(store.undo(projectId, jobId, body.version));
    if (body.action === 'discard') return Response.json(store.discard(projectId, jobId));
    throw new Error('AI 草稿操作不正确');
  } catch (error) { return errorResponse(error); }
}
