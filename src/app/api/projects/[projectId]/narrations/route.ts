import { getStore } from '@/server/db';
import { SpeechStore } from '@/server/narration/store';
import { speechConfig } from '@/server/providers/tts/minimax';
import { errorResponse, localMutation } from '@/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, context: Context) {
  const { projectId } = await context.params;
  if (!getStore().get(projectId)) return Response.json({ error: '项目不存在' }, { status: 404 });
  const state = new SpeechStore(getStore()).list(projectId);
  return Response.json({ ...state, assets: state.assets.map(asset => ({ ...asset, path: '' })) });
}
export async function POST(request: Request, context: Context) {
  try {
    localMutation(request); const { projectId } = await context.params;
    const config = speechConfig();
    if (!config.configured) throw new Error('尚未配置 MiniMax。请在 .env.local 填写 MINIMAX_API_KEY，并重启 Web 和 Worker');
    const body = await request.json();
    if (body.force !== undefined && typeof body.force !== 'boolean') throw new Error('重做参数不正确');
    return Response.json(new SpeechStore(getStore()).enqueue(projectId, body.version, body.sceneIds, config, body.force === true), { status: 202 });
  } catch (error) { return errorResponse(error); }
}
