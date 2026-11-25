import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getStore } from '@/server/db';
import { VoiceStore } from '@/server/voices/store';
import { normalizeReference, wavInfo } from '@/server/voices/audio';
import { managedPath } from '@/server/storage';
import { boundedBody, localMutation, errorResponse } from '@/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(new VoiceStore(getStore()).list().map(v => ({ ...v, path: '' }))); }
export async function POST(request: Request) {
  try {
    const limit = 10 * 1024 * 1024 + 20_000; localMutation(request, limit);
    const body = await boundedBody(request, limit);
    const form = await new Response(body, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData();
    const name = form.get('name'); const referenceText = form.get('referenceText'); const audio = form.get('audio');
    if (typeof name !== 'string' || !name.trim() || name.length > 40 || typeof referenceText !== 'string' || !referenceText.trim() || Array.from(referenceText).length > 1000) throw new Error('请填写音色名称（40 字以内）和准确录音文字（1000 字以内）');
    if (!(audio instanceof File) || !/\.(wav|mp3)$/i.test(audio.name) || audio.size > 10 * 1024 * 1024) throw new Error('请上传不超过 10 MB 的 WAV 或 MP3');
    const wav = await normalizeReference(Buffer.from(await audio.arrayBuffer()));
    const id = randomUUID(); const path = `voices/${id}/reference.wav`;
    await mkdir(dirname(managedPath(path)), { recursive: true }); await writeFile(managedPath(path), wav, { flag: 'wx' });
    const voice = new VoiceStore(getStore()).create({ id, name, referenceText, path, durationSeconds: wavInfo(wav).durationSeconds, hash: createHash('sha256').update(wav).digest('hex') });
    return Response.json({ ...voice, path: '' }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
