import { getStore } from '@/server/db';
import { AiStore } from '@/server/ai/store';
import { aiConfig } from '@/server/providers/llm/deepseek';
import { parseAiInput } from '@/shared/ai-validation';
import { errorResponse, localMutation } from '@/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, context: Context) {
  const { projectId } = await context.params;
  if (!getStore().get(projectId)) return Response.json({ error: '项目不存在' }, { status: 404 });
  return Response.json(new AiStore(getStore()).list(projectId));
}
export async function POST(request: Request, context: Context) {
  try {
    localMutation(request);
    const config = aiConfig();
    if (!config.configured) throw new Error('尚未配置 DeepSeek，请在 .env.local 填写 DEEPSEEK_API_KEY 并重启服务');
    const { projectId } = await context.params; const body = await request.json();
    return Response.json(new AiStore(getStore()).enqueue(projectId, body.version, parseAiInput(body.input), config.model), { status: 202 });
  } catch (error) { return errorResponse(error); }
}
