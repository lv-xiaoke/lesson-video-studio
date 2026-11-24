import { getStore } from '@/server/db';
import { SpeechStore } from '@/server/narration/store';
import { mediaResponse } from '@/server/storage/media';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; assetId: string }> }) {
  const { projectId, assetId } = await params; const asset = new SpeechStore(getStore()).asset(assetId);
  if (!asset || asset.projectId !== projectId) return Response.json({ error: '配音不存在' }, { status: 404 });
  try { return mediaResponse(request, asset.path, 'audio/mpeg'); }
  catch { return Response.json({ error: '配音文件缺失，请重新生成' }, { status: 404 }); }
}
