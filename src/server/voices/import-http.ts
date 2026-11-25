import { NotFoundError } from '../db/store.ts';
import { publicVoiceImportMessage } from '../../shared/voice-import.ts';
export function voiceImportErrorResponse(error: unknown) {
  if (error instanceof NotFoundError) return Response.json({ error: '导入记录不存在' }, { status: 404 });
  return Response.json({ error: publicVoiceImportMessage(error) }, { status: 400 });
}
