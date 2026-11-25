import { speechConfig } from '@/server/providers/tts';
import { zipvoiceHealth } from '@/server/providers/tts/zipvoice';
import { getStore } from '@/server/db';
import { errorResponse } from '@/server/http';
import type { SpeechProvider } from '@/shared/narration';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const id = params.get('projectId'); const project = id ? getStore().get(id) : undefined;
    if (id && !project) return Response.json({ error: '项目不存在' }, { status: 404 });
    const provider = params.get('provider') || project?.lesson.speechProvider;
    if (provider && !['tencent', 'minimax', 'zipvoice'].includes(provider)) throw new Error('配音服务不正确');
    const config = speechConfig(provider as SpeechProvider | undefined);
    return Response.json(config.provider === 'zipvoice' ? await zipvoiceHealth() : config);
  } catch (error) { return errorResponse(error); }
}
