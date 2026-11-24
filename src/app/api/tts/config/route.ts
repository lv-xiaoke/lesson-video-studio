import { speechConfig } from '@/server/providers/tts/minimax';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(speechConfig()); }
