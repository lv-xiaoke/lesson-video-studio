import { aiConfig } from '@/server/providers/llm/deepseek';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(aiConfig()); }
