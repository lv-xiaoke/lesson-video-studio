import { getStore } from '@/server/db';
import { VoiceStore } from '@/server/voices/store';
import { zipvoiceHealth } from '@/server/providers/tts/zipvoice';
import { localMutation, errorResponse, boundedBody } from '@/server/http';
export const runtime = 'nodejs';
type Context = { params: Promise<{ voiceId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    localMutation(request); const { voiceId } = await context.params; const body = JSON.parse((await boundedBody(request, 200000)).toString('utf8'));
    const config = await zipvoiceHealth(); if (!config.configured) throw new Error(config.reason);
    return Response.json(new VoiceStore(getStore()).preview(voiceId, body.text), { status: 202 });
  } catch (error) { return errorResponse(error); }
}
