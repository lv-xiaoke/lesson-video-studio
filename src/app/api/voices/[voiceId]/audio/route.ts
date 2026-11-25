import { getStore } from '@/server/db';
import { VoiceStore } from '@/server/voices/store';
import { mediaResponse } from '@/server/storage/media';
import { errorResponse } from '@/server/http';
export const runtime = 'nodejs';
type Context = { params: Promise<{ voiceId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { voiceId } = await context.params; const voice = new VoiceStore(getStore()).get(voiceId);
    if (!voice) return Response.json({ error: '音色不存在' }, { status: 404 });
    return mediaResponse(request, voice.path, 'audio/wav');
  } catch (error) { return errorResponse(error); }
}
