import { getStore } from '@/server/db';
import { errorResponse, localMutation } from '@/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, context: Context) { const { projectId } = await context.params; return Response.json(getStore().jobs(projectId)); }
export async function POST(request: Request, context: Context) {
  try { localMutation(request); const { projectId } = await context.params; const body = await request.json(); return Response.json(getStore().enqueue(projectId, body.version), { status: 202 }); }
  catch (error) { return errorResponse(error); }
}
