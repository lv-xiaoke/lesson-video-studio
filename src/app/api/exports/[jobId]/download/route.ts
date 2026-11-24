import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { getStore } from '@/server/db';
import { managedPath } from '@/server/storage';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params; const job = getStore().job(jobId);
  if (!job || job.status !== 'succeeded' || !job.output) return Response.json({ error: '视频尚未制作完成' }, { status: 404 });
  try {
    const path = managedPath(job.output); const stat = statSync(path);
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
    return new Response(stream, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(stat.size), 'Content-Disposition': `attachment; filename="lesson-${job.version}.mp4"`, 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: '视频文件不存在，请重新导出' }, { status: 404 }); }
}
