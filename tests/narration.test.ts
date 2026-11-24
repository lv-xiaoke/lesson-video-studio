import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExampleLesson, parseLesson } from '../src/shared/lesson.ts';
import { buildTimeline } from '../src/video/timeline/index.ts';
import { narrationSignature } from '../src/shared/narration.ts';
import { ProjectStore } from '../src/server/db/store.ts';
import { SpeechStore } from '../src/server/narration/store.ts';
import { parseMiniMaxResult } from '../src/server/providers/tts/minimax.ts';
import { mediaResponse } from '../src/server/storage/media.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { managedPath } from '../src/server/storage/index.ts';
import { estimateSpeechCost } from '../src/shared/narration.ts';

const config = { model: 'speech-2.6-hd', pricePer10k: 3.5 };
test('voice settings survive round-trip and malformed voice settings are rejected', () => {
  const lesson = createExampleLesson('配音');
  lesson.scenes[0].voice = { voiceId: 'male-qn-qingse', speed: 1.2 };
  assert.equal(parseLesson(lesson).scenes[0].voice?.speed, 1.2);
  lesson.scenes[0].voice.speed = 0;
  assert.throws(() => parseLesson(lesson), /语速/);
});
test('audio timing uses measured length plus tail, leaving following scenes contiguous', () => {
  const lesson = createExampleLesson();
  const result = buildTimeline(lesson.scenes, 30, { intro: { durationSeconds: 13.2, src: '/audio' } });
  assert.equal(result[0].durationInFrames, 407);
  assert.equal(result[1].from, 407);
});
test('visual edits keep narration signature but changed narration or speed invalidates it', () => {
  const scene = createExampleLesson().scenes[0];
  const before = narrationSignature(scene);
  scene.title = '另一个标题'; scene.content = '另一种画面';
  assert.equal(narrationSignature(scene), before);
  scene.narration += '补充。'; assert.notEqual(narrationSignature(scene), before);
});
test('MiniMax rejects HTTP-success business errors and missing audio length', () => {
  assert.throws(() => parseMiniMaxResult({ base_resp: { status_code: 1008 }, data: null }), /MiniMax/);
  assert.throws(() => parseMiniMaxResult({ base_resp: { status_code: 0 }, data: { audio: '00'.repeat(128) }, extra_info: {} }), /时长/);
  const result = parseMiniMaxResult({ base_resp: { status_code: 0 }, data: { audio: '00'.repeat(128) }, extra_info: { audio_length: 1250, usage_characters: 12 } });
  assert.equal(result.durationSeconds, 1.25);
  assert.equal(result.audio.length, 128);
  const unknownUsage = parseMiniMaxResult({ base_resp: { status_code: 0 }, data: { audio: '00'.repeat(128) }, extra_info: { audio_length: 1250 } });
  assert.equal(unknownUsage.usageCharacters, null);
});
test('duplicate synthesis is claimed once; valid audio is reused and stale audio cannot export', () => {
  const projects = new ProjectStore(':memory:'); const speech = new SpeechStore(projects);
  try {
    const project = projects.create('配音缓存');
    const first = speech.enqueue(project.id, project.version, ['intro'], config);
    const duplicate = speech.enqueue(project.id, project.version, ['intro'], config);
    assert.equal(first.jobs[0].id, duplicate.jobs[0].id);
    const job = speech.claim()!; assert.equal(speech.claim(), undefined);
    const asset = speech.complete(job.id, { path: 'audio/test.mp3', durationSeconds: 12, bytes: 500, usageCharacters: 30 });
    assert.equal(speech.enqueue(project.id, 1, ['intro'], config).reused[0].id, asset.id);
    const changed = structuredClone(project.lesson); changed.scenes[0].narration = '新的讲解';
    projects.save(project.id, changed, 1);
    assert.throws(() => speech.forExport(project.id, 2), /配音/);
    assert.equal(speech.list(project.id).assets.length, 1);
  } finally { projects.close(); }
});
test('an old speech completion never marks a newer narration as ready and exports freeze audio ids', () => {
  const projects = new ProjectStore(':memory:'); const speech = new SpeechStore(projects);
  try {
    const project = projects.create('旧任务');
    speech.enqueue(project.id, 1, ['intro'], config); const old = speech.claim()!;
    const changed = structuredClone(project.lesson); changed.scenes[0].narration = '更新后的讲解';
    projects.save(project.id, changed, 1);
    speech.complete(old.id, { path: 'old.mp3', durationSeconds: 3, bytes: 300, usageCharacters: 2 });
    assert.equal(speech.ready(projects.get(project.id)!).length, 0);
    speech.enqueue(project.id, 2, changed.scenes.map(s => s.id), config);
    for (let job = speech.claim(); job; job = speech.claim()) speech.complete(job.id, { path: `${job.id}.mp3`, durationSeconds: 4, bytes: 500, usageCharacters: 20 });
    const tracks = speech.forExport(project.id, 2);
    const exported = projects.enqueue(project.id, 2, tracks);
    assert.equal(exported.audio?.length, 3);
    assert.equal(exported.audio?.[0].assetId, tracks[0].assetId);
    assert.equal(speech.ready(projects.get(project.id)!).length, 3);
  } finally { projects.close(); }
});

test('force generation creates a replacement but never repeats an in-flight paid request', () => {
  const projects = new ProjectStore(':memory:'); const speech = new SpeechStore(projects);
  try {
    const project = projects.create('重做');
    const first = speech.enqueue(project.id, 1, ['intro'], config).jobs[0];
    speech.claim(); speech.fail(first.id, '服务不可用');
    const retry = speech.enqueue(project.id, 1, ['intro'], config).jobs[0];
    assert.notEqual(retry.id, first.id);
    const claimed = speech.claim()!;
    speech.complete(claimed.id, { path: 'test.mp3', durationSeconds: 3, bytes: 300, usageCharacters: 12 });
    const replacement = speech.enqueue(project.id, 1, ['intro'], config, true).jobs[0];
    assert.notEqual(replacement.id, retry.id);
    assert.equal(speech.enqueue(project.id, 1, ['intro'], config, true).jobs[0].id, replacement.id);
  } finally { projects.close(); }
});

test('audio endpoint reads exact byte ranges and rejects malformed or out-of-bounds ranges', async () => {
  mkdirSync(managedPath('test-runs'), { recursive: true });
  const relative = `test-runs/${randomUUID()}.mp3`;
  writeFileSync(managedPath(relative), Buffer.from('0123456789'));
  const response = mediaResponse(new Request('http://localhost/audio', { headers: { Range: 'bytes=2-5' } }), relative, 'audio/mpeg');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await response.text(), '2345');
  const suffix = mediaResponse(new Request('http://localhost/audio', { headers: { Range: 'bytes=-3' } }), relative, 'audio/mpeg');
  assert.equal(await suffix.text(), '789');
  for (const range of ['bytes=20-', 'bytes=4-2', 'bytes=0-1,3-4']) {
    assert.equal(mediaResponse(new Request('http://localhost/audio', { headers: { Range: range } }), relative, 'audio/mpeg').status, 416);
  }
});

test('fee estimates are optional, and audio pauses do not round a following scene into overlap', () => {
  assert.equal(estimateSpeechCost('一二三四五', null), null);
  assert.equal(estimateSpeechCost('一二三四五', 2), 0.001);
  const lesson = createExampleLesson();
  const timeline = buildTimeline(lesson.scenes, 30, { intro: { src: '/x', durationSeconds: 1.25 } });
  assert.equal(timeline[0].durationInFrames, 90);
  assert.equal(timeline[1].from, 90);
});

test('changing the configured model requires matching-model audio before export', () => {
  const projects = new ProjectStore(':memory:'); const speech = new SpeechStore(projects);
  try {
    const p = projects.create('模型切换');
    speech.enqueue(p.id, 1, p.lesson.scenes.map(s => s.id), config);
    for (let j = speech.claim(); j; j = speech.claim()) speech.complete(j.id, { path: j.id + '.mp3', durationSeconds: 3, bytes: 200, usageCharacters: 10 });
    assert.equal(speech.ready(p, 'speech-2.8-hd').length, 0);
    assert.throws(() => speech.forExport(p.id, 1, 'speech-2.8-hd'), /配音/);
    assert.equal(speech.forExport(p.id, 1, config.model).length, 3);
  } finally { projects.close(); }
});

test('active synthesis is deduplicated even after more than 200 newer jobs', () => {
  const projects = new ProjectStore(':memory:'); const speech = new SpeechStore(projects);
  try {
    let p = projects.create('排队历史');
    const original = structuredClone(p.lesson);
    const first = speech.enqueue(p.id, p.version, ['intro'], config).jobs[0];
    for (let i = 0; i < 201; i++) {
      p.lesson.scenes[0].narration = '讲解版本' + i;
      p = projects.save(p.id, p.lesson, p.version);
      speech.enqueue(p.id, p.version, ['intro'], config);
    }
    p = projects.save(p.id, original, p.version);
    assert.equal(speech.enqueue(p.id, p.version, ['intro'], config).jobs[0].id, first.id);
  } finally { projects.close(); }
});
