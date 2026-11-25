import { getStore } from '@/server/db';
import { VoiceImportStore } from '@/server/voices/imports';
import { boundedBody, localMutation } from '@/server/http';
import { voiceImportErrorResponse } from '@/server/voices/import-http';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ importId: string }> }) {
  try {
    localMutation(request); const { importId } = await context.params;
    const body = JSON.parse((await boundedBody(request, 200000)).toString('utf8'));
    const voice = new VoiceImportStore(getStore()).save(importId, body.name, body.referenceText);
    return Response.json({ ...voice, path: '' });
  } catch (error) { return voiceImportErrorResponse(error); }
}
