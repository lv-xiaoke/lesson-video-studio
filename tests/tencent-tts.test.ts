import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExampleLesson } from '../src/shared/lesson.ts';
import { narrationSignature, voiceOf } from '../src/shared/narration.ts';
import { ProjectStore } from '../src/server/db/store.ts';
import { SpeechStore } from '../src/server/narration/store.ts';
import { processSpeechJob } from '../src/server/narration/process.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SpeechJob } from '../src/shared/narration.ts';

const loadTencent = () => import('../src/server/providers/tts/tencent.ts');
function job(text = '先理解问题。'): SpeechJob {
  return { id: 'test', projectId: 'project', sceneId: 'intro', version: 1, signature: '', text,
    model: 'tencent-basic-v1', voice: { voiceId: '101001', speed: 1 }, pricePer10k: null,
    status: 'running', error: null, createdAt: '2026-11-24' };
}
const credentials = { secretId: 'fixture-id', secretKey: 'fixture-secret' };

test('Tencent selects a compatible default without mutating an existing MiniMax scene', () => {
  const scene = createExampleLesson().scenes[0];
  scene.voice = { voiceId: 'male-qn-qingse', speed: 1.2 };
  assert.deepEqual(voiceOf(scene, 'tencent'), { voiceId: '101001', speed: 1.2 });
  assert.equal(scene.voice.voiceId, 'male-qn-qingse');
  assert.notEqual(narrationSignature(scene, 'tencent'), narrationSignature(scene, 'minimax'));
});

test('long mixed narration stays intact and every Tencent segment fits the short-text API', async () => {
  const { splitTencentText } = await loadTencent();
  for (const text of ['一'.repeat(301), '教学内容。'.repeat(80), 'ABC123😀，中文。'.repeat(80)]) {
    const parts = splitTencentText(text);
    assert.equal(parts.join(''), text);
    assert(parts.length > 1);
    assert(parts.every(p => p.length <= 150 && Buffer.byteLength(p) <= 450));
    assert(parts.every(p => !/[\uD800-\uDBFF]$/.test(p)));
  }
  assert.throws(() => splitTencentText('  '), /讲解/);
});

test('normal speed uses Tencent zero rather than incorrectly doubling the speaking rate', async () => {
  const { tencentSpeed } = await loadTencent();
  for (const [speed, expected] of [[0.6, -2], [0.8, -1], [1, 0], [1.2, 1], [1.5, 2], [2, 4]]) {
    assert.equal(tencentSpeed(speed), expected);
  }
  assert.throws(() => tencentSpeed(NaN), /语速/);
});

test('TC3 HMAC matches an independently derived fixed-time Chinese reference vector', async () => {
  const { tencentHeaders } = await loadTencent();
  const payload = '{"Text":"你好","SessionId":"reference-session","VoiceType":101001,"Speed":0,"SampleRate":16000,"Codec":"pcm"}';
  const headers = tencentHeaders(payload, 'fixture-id', 'fixture-secret', 1551113065);
  // Literal reference calculated independently with Python hashlib/hmac and Tencent TC3 specification.
  assert.equal(headers['X-TC-Timestamp'], '1551113065');
  assert.equal(headers.Authorization, 'TC3-HMAC-SHA256 Credential=fixture-id/2019-02-25/tts/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=e4345fe2a0836fda5a58161716d67484656726e732317329262fe3b9e914df94');
});

test('Tencent signs the official action and combines PCM into a playable WAV with measured duration', async () => {
  const { synthesizeTencent } = await loadTencent();
  const payloads: Record<string, unknown>[] = [];
  const transport: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'https://tts.tencentcloudapi.com/');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-tc-action'), 'TextToVoice');
    assert.equal(headers.get('x-tc-version'), '2019-08-23');
    assert.match(headers.get('authorization')!, /^TC3-HMAC-SHA256 Credential=fixture-id\/\d{4}-\d{2}-\d{2}\/tts\/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=[0-9a-f]{64}$/);
    assert(!JSON.stringify(init?.headers).includes('fixture-secret'));
    const payload = JSON.parse(String(init?.body)); payloads.push(payload);
    assert.equal(payload.Codec, 'pcm'); assert.equal(payload.SampleRate, 16000);
    assert.equal(payload.VoiceType, 101001); assert.equal(payload.Speed, 0);
    const pcm = Buffer.alloc(32000, payloads.length);
    return Response.json({ Response: { Audio: pcm.toString('base64'), SessionId: payload.SessionId, RequestId: 'fixture' } });
  };
  const result = await synthesizeTencent(job('一'.repeat(151)), { ...credentials, fetcher: transport });
  assert.equal(payloads.length, 2);
  assert.equal(result.format, 'wav'); assert.equal(result.durationSeconds, 2);
  assert.equal(result.audio.toString('ascii', 0, 4), 'RIFF');
  assert.equal(result.audio.toString('ascii', 8, 12), 'WAVE');
  assert.equal(result.audio.readUInt32LE(40), 64000);
  assert.equal(result.audio.length, 64044);
  assert.equal(result.audio[44], 1); assert.equal(result.audio[32044], 2);
  assert.equal(result.usageCharacters, null);
});

test('quota exhaustion stops later segments and never retries or exposes the returned message', async () => {
  const { synthesizeTencent } = await loadTencent();
  let calls = 0;
  await assert.rejects(synthesizeTencent(job('一'.repeat(451)), { ...credentials, fetcher: async () => {
    calls++;
    return calls === 1 ? Response.json({ Response: { Audio: Buffer.alloc(32000).toString('base64') } })
      : Response.json({ Response: { Error: { Code: 'UnsupportedOperation.PkgExhausted', Message: 'fixture-secret' }, RequestId: 'fixture' } });
  } }), error => {
    assert(error instanceof Error);
    assert.match(error.message, /资源包/); assert.match(error.message, /第 2/);
    assert(!error.message.includes('fixture-secret')); return true;
  });
  assert.equal(calls, 2);
});

test('Tencent rejects non-premium voices before making a request and rejects corrupt PCM', async () => {
  const { synthesizeTencent } = await loadTencent();
  const invalid = job(); invalid.voice.voiceId = '402000';
  await assert.rejects(synthesizeTencent(invalid, { ...credentials, fetcher: async () => { throw new Error('unexpected request'); } }), /精品音色/);
  await assert.rejects(synthesizeTencent(job(), { ...credentials, fetcher: async () => Response.json({ Response: { Audio: 'not base64!' } }) }), /音频/);
  await assert.rejects(synthesizeTencent(job(), { ...credentials, fetcher: async () => Response.json({ Response: { Audio: 'AQ==' } }) }), /音频/);
  await assert.rejects(synthesizeTencent(job(), { ...credentials, fetcher: async () => { throw new Error('fixture-secret'); } }), /不会自动重试/);
});

test('public Tencent config checks both keys and never returns credentials', async () => {
  const { speechConfig } = await import('../src/server/providers/tts/index.ts');
  const names = ['TTS_PROVIDER', 'TENCENT_SECRET_ID', 'TENCENT_SECRET_KEY'] as const;
  const saved = names.map(name => process.env[name]);
  try {
    process.env.TTS_PROVIDER = 'tencent'; process.env.TENCENT_SECRET_ID = 'fixture-id';
    delete process.env.TENCENT_SECRET_KEY;
    assert.equal(speechConfig().configured, false);
    process.env.TENCENT_SECRET_KEY = 'fixture-secret';
    const config = speechConfig();
    assert.equal(config.configured, true); assert.equal(config.provider, 'tencent');
    assert.equal(config.model, 'tencent-basic-v1'); assert.equal(config.pricePer10k, null);
    assert(!JSON.stringify(config).includes('fixture-'));
    process.env.TTS_PROVIDER = 'misspelled';
    assert.throws(() => speechConfig(), /TTS_PROVIDER/);
  } finally { names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; }); }
});

test('Tencent jobs freeze the actual voice and cannot reuse MiniMax audio', () => {
  const projects = new ProjectStore(':memory:');
  const store = new SpeechStore(projects);
  try {
    const p = projects.create('腾讯云配音');
    store.enqueue(p.id, 1, ['intro'], { model: 'speech-2.6-hd', pricePer10k: null });
    const mini = store.claim()!;
    store.complete(mini.id, { path: 'existing.mp3', bytes: 100, durationSeconds: 3, usageCharacters: null });
    const queued = store.enqueue(p.id, 1, ['intro'], { model: 'tencent-basic-v1', pricePer10k: null });
    assert.equal(queued.reused.length, 0);
    assert.equal(queued.jobs[0].voice.voiceId, '101001');
    assert.equal(queued.jobs[0].signature, narrationSignature(p.lesson.scenes[0], 'tencent'));
    const job = store.claim()!;
    store.complete(job.id, { path: 'new.wav', bytes: 32044, durationSeconds: 1, usageCharacters: null });
    assert.equal(store.ready(p, 'tencent-basic-v1')[0].id, job.id);
    assert.equal(store.enqueue(p.id, 1, ['intro'], { model: 'tencent-basic-v1', pricePer10k: null }).reused[0].id, job.id);
  } finally { projects.close(); }
});

test('Tencent WAV survives the worker persistence boundary with the right extension', async () => {
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = resolve('data/test-runs', randomUUID());
  const projects = new ProjectStore(':memory:'); const store = new SpeechStore(projects);
  try {
    const p = projects.create('WAV 音轨');
    store.enqueue(p.id, 1, ['intro'], { model: 'tencent-basic-v1', pricePer10k: null });
    const claimed = store.claim()!;
    const result = await processSpeechJob(claimed, store, async () => ({ audio: Buffer.from('RIFFfixture'), format: 'wav' as const, durationSeconds: 2, usageCharacters: null }));
    assert.match(result.path, /\.wav$/);
    assert.equal(readFileSync(resolve(process.env.DATA_DIR!, result.path)).toString(), 'RIFFfixture');
    assert.equal(store.job(claimed.id)?.status, 'succeeded');
  } finally {
    projects.close(); if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
  }
});
