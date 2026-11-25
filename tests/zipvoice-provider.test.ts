import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { ProjectStore } from '../src/server/db/store.ts';
import { VoiceStore } from '../src/server/voices/store.ts';
import { SpeechStore } from '../src/server/narration/store.ts';
import { pcmWav } from '../src/server/voices/audio.ts';
import { synthesizeZipVoice, zipvoiceHealth, zipvoiceConfig } from '../src/server/providers/tts/zipvoice.ts';
import { processSpeechJob } from '../src/server/narration/process.ts';
import { ZIPVOICE_MODEL } from '../src/shared/narration.ts';
import { boundedBody } from '../src/server/http.ts';

test('upload body limit counts actual stream bytes even when length header is absent', async () => {
  await assert.rejects(boundedBody(new Request('http://localhost', { method: 'POST', body: 'too long' }), 3), /过大/);
  assert.equal((await boundedBody(new Request('http://localhost', { method: 'POST', body: 'ok' }), 3)).toString(), 'ok');
});

test('local adapter combines real WAV segments, measures speed and rejects failed or tampered reference without publishing assets', async () => {
  const previous = process.env.DATA_DIR; const root = resolve('data/test-zipvoice', randomUUID());
  process.env.DATA_DIR = root; mkdirSync(join(root, 'zipvoice'), { recursive: true }); mkdirSync(join(root, 'voices'), { recursive: true });
  const reference = pcmWav(Buffer.alloc(48000 * 4)); writeFileSync(join(root, 'voices/ref.wav'), reference);
  let failure = false;
  const engine = createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer private-test-token') { res.writeHead(401).end(); return; }
    if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ready: true, model: ZIPVOICE_MODEL })); return; }
    for await (const _chunk of req) { /* drain request */ }
    if (failure) { res.writeHead(500).end(); return; }
    res.setHeader('Content-Type', 'audio/wav'); res.end(pcmWav(Buffer.alloc(48000)));
  });
  await new Promise<void>(r => engine.listen(0, '127.0.0.1', r));
  const port = (engine.address() as { port: number }).port;
  writeFileSync(join(root, 'zipvoice/service.json'), JSON.stringify({ port, token: 'private-test-token' }));
  const projects = new ProjectStore(':memory:');
  try {
    const voices = new VoiceStore(projects); const speech = new SpeechStore(projects);
    const voice = voices.create({ name: '测试', path: 'voices/ref.wav', referenceText: '准确原文', durationSeconds: 4, hash: createHash('sha256').update(reference).digest('hex') });
    const p = projects.create('本地适配器'); p.lesson.scenes[0].narration = '第一句。第二句。'; p.lesson.scenes[0].voice = { voiceId: voice.id, speed: 1 };
    const saved = projects.save(p.id, p.lesson, 1); speech.enqueue(saved.id, saved.version, ['intro'], { model: ZIPVOICE_MODEL, pricePer10k: 0 }); const job = speech.claim()!;
    const health = await zipvoiceHealth();
    assert.equal(health.configured, true, JSON.stringify(health));
    const result = await synthesizeZipVoice(job, voices); assert.equal(result.durationSeconds, 2); assert.equal(result.format, 'wav');
    failure = true;
    await assert.rejects(processSpeechJob(job, speech, j => synthesizeZipVoice(j, voices)), /引擎生成失败/);
    assert.equal(speech.list(saved.id).assets.length, 0);
    writeFileSync(join(root, 'voices/ref.wav'), pcmWav(Buffer.alloc(48000 * 5)));
    await assert.rejects(synthesizeZipVoice(job, voices), /校验失败/);
    writeFileSync(join(root, 'zipvoice/service.json'), 'private-test-token');
    const broken = zipvoiceConfig();
    assert.equal(broken.configured, false);
    assert.ok(!broken.reason?.includes('private-'), 'public health must not expose configuration snippets');
  } finally { projects.close(); await new Promise<void>(r => engine.close(() => r())); if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous; }
});
