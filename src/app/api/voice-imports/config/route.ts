import { asrConfig } from '@/server/voices/transcribe';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(await asrConfig()); }
