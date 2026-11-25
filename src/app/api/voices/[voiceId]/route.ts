import { getStore } from '@/server/db';
import { VoiceStore } from '@/server/voices/store';
import { localMutation, errorResponse, boundedBody } from '@/server/http';
export const runtime = 'nodejs';
type Context = { params: Promise<{ voiceId: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    localMutation(request); const { voiceId } = await context.params; const body = JSON.parse((await boundedBody(request, 200000)).toString('utf8'));
    const store = new VoiceStore(getStore());
    if (body.archived !== true && typeof body.name !== 'string') throw new Error('请指定名称或停用音色');
    const voice = body.archived === true ? store.archive(voiceId) : store.rename(voiceId, body.name);
    return Response.json({ ...voice, path: '' });
  } catch (error) { return errorResponse(error); }
}
