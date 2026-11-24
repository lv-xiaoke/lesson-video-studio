import { getStore } from '@/server/db';
import { errorResponse, localMutation } from '@/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(getStore().list()); }
export async function POST(request: Request) {
  try { localMutation(request); const body = await request.json(); return Response.json(getStore().create(body.title), { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
