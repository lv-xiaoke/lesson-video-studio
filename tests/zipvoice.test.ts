import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectStore } from '../src/server/db/store.ts';
import { VoiceStore } from '../src/server/voices/store.ts';
import { SpeechStore } from '../src/server/narration/store.ts';
import { createExampleLesson, parseLesson } from '../src/shared/lesson.ts';
import { normalizeAiResult } from '../src/shared/ai-validation.ts';
import { providerForModel, voiceOf, ZIPVOICE_MODEL } from '../src/shared/narration.ts';

test('project speech service survives parsing and AI lesson/rewrite application', () => {
  const source = { ...createExampleLesson(), speechProvider: 'zipvoice' as const };
  assert.equal(parseLesson(source).speechProvider, 'zipvoice');
  assert.throws(() => parseLesson({ ...source, speechProvider: 'bad' }), /配音服务/);
  const scene = { ...source.scenes[0], kind: 'title' };
  assert.equal(normalizeAiResult({ title: '课程', scenes: [scene] }, { kind: 'lesson', topic: '测试', audience: '学生', targetSeconds: 60 }, source).speechProvider, 'zipvoice');
  assert.equal(normalizeAiResult({ scene }, { kind: 'scene', sceneId: 'intro', instruction: '改写' }, source).speechProvider, 'zipvoice');
});

test('local engine is routed explicitly and never silently assigns a cloud voice', () => {
  assert.equal(providerForModel(ZIPVOICE_MODEL), 'zipvoice');
  assert.equal(providerForModel('speech-2.6-hd'), 'minimax');
  assert.equal(voiceOf(createExampleLesson().scenes[0], 'zipvoice').voiceId, '');
});

test('archived voice rejects new jobs atomically but frozen jobs and cached audio survive', () => {
  const projects = new ProjectStore(':memory:');
  try {
    const voices = new VoiceStore(projects); const speech = new SpeechStore(projects);
    const voice = voices.create({ name: '讲师', path: 'voices/test/reference.wav', referenceText: '录音文字', durationSeconds: 5, hash: 'a'.repeat(64) });
    const project = projects.create('本地配音');
    const lesson = { ...project.lesson, speechProvider: 'zipvoice' as const };
    lesson.scenes.forEach(s => { s.voice = { voiceId: voice.id, speed: 1 }; });
    const saved = projects.save(project.id, lesson, project.version);
    const job = speech.enqueue(saved.id, saved.version, ['intro'], { model: ZIPVOICE_MODEL, pricePer10k: null }).jobs[0];
    assert.equal(job.referenceHash, 'a'.repeat(64));
    voices.rename(voice.id, '新名称');
    assert.equal(voices.get(voice.id)?.hash, job.referenceHash);
    voices.archive(voice.id);
    assert.throws(() => speech.enqueue(saved.id, saved.version, ['compare', 'summary'], { model: ZIPVOICE_MODEL, pricePer10k: null }), /停用/);
    assert.equal(speech.list(saved.id).jobs.length, 1);
    assert.ok(voices.get(job.voice.voiceId));
    const claimed = speech.claim()!;
    speech.complete(claimed.id, { path: 'test.wav', durationSeconds: 4, bytes: 100, usageCharacters: null });
    assert.equal(speech.ready(saved, ZIPVOICE_MODEL).length, 1);
    assert.equal(voices.list().length, 0);
    assert.equal(voices.list(true).length, 1);
  } finally { projects.close(); }
});

test('preview tasks retain voice identity and recover interrupted generation as failed', () => {
  const projects = new ProjectStore(':memory:');
  try {
    const voices = new VoiceStore(projects);
    const voice = voices.create({ name: '测试', path: 'voices/a/reference.wav', referenceText: '你好', durationSeconds: 4, hash: 'b'.repeat(64) });
    const preview = voices.preview(voice.id, '这是一句试听。');
    assert.equal(voices.claim()?.id, preview.id);
    voices.recoverInterrupted();
    assert.equal(voices.getPreview(voice.id, preview.id)?.status, 'failed');
    voices.archive(voice.id);
    assert.throws(() => voices.preview(voice.id, '测试'), /停用/);
    assert.throws(() => voices.preview('missing', '测试'), /不存在/);
  } finally { projects.close(); }
});
