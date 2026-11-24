import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExampleLesson, parseLesson } from '../src/shared/lesson.ts';
import { buildTimeline } from '../src/video/timeline/index.ts';
import { ProjectStore } from '../src/server/db/store.ts';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { acquireWorkerGuard } from '../src/server/jobs/worker-guard.ts';
import { localMutation } from '../src/server/http.ts';

test('timeline uses actual scene durations without gaps and rounds at frame boundaries', () => {
  const lesson = createExampleLesson('测试');
  lesson.scenes[0].durationSeconds = 3.25;
  lesson.scenes[1].durationSeconds = 4;
  lesson.scenes[2].durationSeconds = 3;
  const result = buildTimeline(lesson.scenes, 30);
  assert.deepEqual(result.map(s => [s.from, s.durationInFrames]), [[0, 98], [98, 120], [218, 90]]);
});

test('invalid or duplicate scenes cannot be saved as a valid lesson', () => {
  const lesson = createExampleLesson('测试');
  lesson.scenes[1].id = lesson.scenes[0].id;
  assert.throws(() => parseLesson(lesson), /重复/);
  lesson.scenes[1].id = 'second';
  lesson.scenes[0].durationSeconds = NaN;
  assert.throws(() => parseLesson(lesson), /时长/);
});

test('scene kind must be a string, not an array coercible to a known kind', () => {
  const lesson = createExampleLesson('类型校验');
  const malformed = JSON.parse(JSON.stringify(lesson));
  malformed.scenes[0].kind = ['title'];
  assert.throws(() => parseLesson(malformed), /画面类型/);
});

test('save restores data and rejects a stale editor without overwriting current content', () => {
  const store = new ProjectStore(':memory:');
  try {
    const project = store.create('二分查找');
    const changed = structuredClone(project.lesson);
    changed.scenes[0].narration = '新讲解';
    const saved = store.save(project.id, changed, project.version);
    assert.equal(saved.version, 2);
    assert.equal(store.get(project.id)?.lesson.scenes[0].narration, '新讲解');
    assert.throws(() => store.save(project.id, project.lesson, 1), /已被修改/);
    assert.equal(store.get(project.id)?.version, 2);
  } finally { store.close(); }
});

test('queued export freezes its project version, can be claimed once and preserves its snapshot', () => {
  const store = new ProjectStore(':memory:');
  try {
    const project = store.create('任务快照');
    const job = store.enqueue(project.id, project.version);
    const updated = structuredClone(project.lesson);
    updated.title = '后来的标题';
    store.save(project.id, updated, 1);
    const claimed = store.claim();
    assert.equal(claimed?.id, job.id);
    assert.equal(claimed?.lesson.title, '任务快照');
    assert.equal(store.claim(), undefined);
    store.progress(job.id, 0.5);
    assert.equal(store.job(job.id)?.progress, 0.5);
    store.finish(job.id, 'result.mp4');
    assert.equal(store.job(job.id)?.status, 'succeeded');
    assert.equal(store.job(job.id)?.version, 1);
  } finally { store.close(); }
});

test('one worker owns the guard and a closed owner releases it for the next worker', () => {
  mkdirSync(resolve('data/test-runs'), { recursive: true });
  const path = resolve('data/test-runs', `worker-${randomUUID()}.sqlite`);
  const first = acquireWorkerGuard(path);
  assert.throws(() => acquireWorkerGuard(path), /后台进程锁/);
  first.close();
  const replacement = acquireWorkerGuard(path);
  replacement.close();
});

test('same local browser origin remains valid after Next normalizes the request URL', () => {
  const request = new Request('http://localhost:3000/api/projects', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } });
  assert.doesNotThrow(() => localMutation(request));
});

test('cross-site and different-port writes are rejected', () => {
  for (const origin of ['https://evil.example', 'http://localhost:4000']) {
    const request = new Request('http://localhost:3000/api/projects', { method: 'POST', headers: { host: 'localhost:3000', origin } });
    assert.throws(() => localMutation(request), /跨站/);
  }
});
