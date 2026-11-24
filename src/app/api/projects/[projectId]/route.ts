import { getStore } from '@/server/db';
import { errorResponse, localMutation } from '@/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, context: Context) {
  const { projectId } = await context.params; const project = getStore().get(projectId);
  return project ? Response.json(project) : Response.json({ error: '项目不存在' }, { status: 404 });
}
export async function PUT(request: Request, context: Context) {
  try { localMutation(request); const { projectId } = await context.params; const body = await request.json(); return Response.json(getStore().save(projectId, body.lesson, body.version)); }
  catch (error) { return errorResponse(error); }
}
