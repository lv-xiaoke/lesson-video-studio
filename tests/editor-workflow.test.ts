import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExampleLesson } from '../src/shared/lesson.ts';
import { narrationSignature, TENCENT_MODEL } from '../src/shared/narration.ts';
import type { SpeechConfig, NarrationAsset, SpeechJob } from '../src/shared/narration.ts';
const config: SpeechConfig = { provider: 'tencent', configured: true, model: TENCENT_MODEL, pricePer10k: null };
const scene = createExampleLesson().scenes[0];
const asset: NarrationAsset = { id: 'audio', projectId: 'p', sceneId: scene.id, signature: narrationSignature(scene, 'tencent'), model: TENCENT_MODEL, durationSeconds: 5, bytes: 100, usageCharacters: null, estimatedCny: null, path: 'audio.wav', createdAt: '' };
const job: SpeechJob = { id: 'job', projectId: 'p', sceneId: scene.id, signature: asset.signature, model: TENCENT_MODEL, version: 1, text: scene.narration, voice: { voiceId: '101001', speed: 1 }, pricePer10k: null, status: 'running', error: null, createdAt: '' };
const helpers = () => import('../src/shared/editor-workflow.ts');
test('scene status distinguishes missing, ready, changed text and matching active jobs', async () => {
  const { sceneSpeechStatus } = await helpers();
  assert.equal(sceneSpeechStatus(scene, { assets: [], jobs: [] }, config), 'missing');
  assert.equal(sceneSpeechStatus(scene, { assets: [asset], jobs: [] }, config), 'ready');
  assert.equal(sceneSpeechStatus({ ...scene, narration: '新的讲解' }, { assets: [asset], jobs: [job] }, config), 'stale');
  assert.equal(sceneSpeechStatus(scene, { assets: [asset], jobs: [job] }, config), 'running');
  assert.equal(sceneSpeechStatus(scene, { assets: [], jobs: [{ ...job, status: 'queued' }] }, config), 'queued');
});
test('failed replacements do not hide valid reusable audio and wrong-model jobs cannot change current status', async () => {
  const { sceneSpeechStatus } = await helpers();
  assert.equal(sceneSpeechStatus(scene, { assets: [asset], jobs: [{ ...job, status: 'failed' }] }, config), 'ready');
  assert.equal(sceneSpeechStatus(scene, { assets: [], jobs: [{ ...job, status: 'failed' }] }, config), 'failed');
  assert.equal(sceneSpeechStatus(scene, { assets: [asset], jobs: [job] }, { ...config, model: 'changed' }), 'stale');
  assert.equal(sceneSpeechStatus(scene, { assets: [asset], jobs: [] }, null), 'loading');
});
test('export readiness identifies the exact missing scenes and allows explicit silent exports', async () => {
  const { exportReadiness } = await helpers();
  const lesson = createExampleLesson();
  assert.deepEqual(exportReadiness(lesson, [lesson.scenes[0].id], true).missing.map(s => s.id), lesson.scenes.slice(1).map(s => s.id));
  assert.equal(exportReadiness(lesson, [], true).ready, false);
  assert.equal(exportReadiness(lesson, lesson.scenes.map(s => s.id), true).ready, true);
  assert.equal(exportReadiness(lesson, [], false).ready, true);
});
