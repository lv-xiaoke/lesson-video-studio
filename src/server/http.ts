import { ConflictError, NotFoundError } from './db/store.ts';
export function errorResponse(error: unknown) {
  const status = error instanceof ConflictError ? 409 : error instanceof NotFoundError ? 404 : 400;
  return Response.json({ error: error instanceof Error ? error.message : '操作失败' }, { status });
}
export function localMutation(request: Request) {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  const destination = new URL(`${url.protocol}//${request.headers.get('host') || url.host}`);
  const local = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  if (!local(destination.hostname)) throw new Error('本机工作台不接受其他主机的修改请求');
  if (origin) {
    let source: URL;
    try { source = new URL(origin); } catch { throw new Error('不接受跨站修改请求'); }
    if (!local(source.hostname) || source.port !== destination.port || source.protocol !== destination.protocol) throw new Error('不接受跨站修改请求');
  }
  const size = Number(request.headers.get('content-length') || 0);
  if (size > 200_000) throw new Error('请求内容过大');
}
