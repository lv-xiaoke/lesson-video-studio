import { getStore } from '@/server/db';
import { VoiceImportStore } from '@/server/voices/imports';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ importId: string }> }) {
  const { importId } = await context.params; const job = new VoiceImportStore(getStore()).get(importId);
  return job ? Response.json({ ...job, sourcePath: '', audioPath: '' }) : Response.json({ error: '导入记录不存在' }, { status: 404 });
}
