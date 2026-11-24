import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { managedPath } from './index.ts';
export function mediaResponse(request: Request, path: string, contentType: string) {
  const absolute = managedPath(path); const { size } = statSync(absolute);
  let start = 0, end = size - 1;
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    if (!match[1]) { const suffix = Number(match[2]); if (!suffix) return new Response(null, { status: 416 }); start = Math.max(0, size - suffix); }
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const headers: Record<string, string> = { 'Content-Type': contentType, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=31536000, immutable' };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  const stream = Readable.toWeb(createReadStream(absolute, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(stream, { status: range ? 206 : 200, headers });
}
