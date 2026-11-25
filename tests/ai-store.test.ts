import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectStore } from '../src/server/db/store.ts';
import { createExampleLesson } from '../src/shared/lesson.ts';
const input = { kind: 'lesson' as const, topic: '缓存', audience: '初学者', targetSeconds: 60 };
async function setup() {
  const { AiStore } = await import('../src/server/ai/store.ts');
  const projects = new ProjectStore(':memory:'); const ai = new AiStore(projects);
  const p = projects.create('原课程');
  return { projects, ai, p };
}
test('AI enqueue is deduplicated, claimed once and completion does not change the course', async () => {
  const { projects, ai, p } = await setup();
  try {
    const first = ai.enqueue(p.id, 1, input, 'deepseek-flash');
    assert.equal(ai.enqueue(p.id, 1, input, 'deepseek-flash').id, first.id);
    assert.equal(ai.claim()?.id, first.id); assert.equal(ai.claim(), undefined);
    ai.complete(first.id, { lesson: createExampleLesson('AI 草稿'), usage: null });
    assert.equal(projects.get(p.id)?.lesson.title, '原课程');
    assert.equal(projects.jobs(p.id).length, 0);
    assert.equal(ai.job(p.id, first.id)?.status, 'succeeded');
  } finally { projects.close(); }
});
test('AI apply and undo are atomic, idempotent and keep increasing the version', async () => {
  const { projects, ai, p } = await setup();
  try {
    const j = ai.enqueue(p.id, 1, input, 'deepseek-flash'); ai.claim();
    ai.complete(j.id, { lesson: createExampleLesson('AI 草稿'), usage: null });
    assert.equal(ai.apply(p.id, j.id, 1).project.version, 2);
    assert.equal(ai.apply(p.id, j.id, 1).project.version, 2);
    assert.equal(ai.undo(p.id, j.id, 2).project.version, 3);
    assert.equal(ai.undo(p.id, j.id, 2).project.version, 3);
    assert.equal(projects.get(p.id)?.lesson.title, '原课程');
    assert.equal(ai.job(p.id, j.id)?.status, 'undone');
  } finally { projects.close(); }
});
test('newer saved edits or deleted target scenes cannot be overwritten by old AI results', async () => {
  const { projects, ai, p } = await setup();
  try {
    const j = ai.enqueue(p.id, 1, { kind: 'scene', sceneId: 'intro', instruction: '简化' }, 'deepseek-flash'); ai.claim();
    ai.complete(j.id, { lesson: createExampleLesson('AI 草稿'), usage: null });
    const changed = structuredClone(p.lesson); changed.title = '用户新编辑'; changed.scenes.shift();
    projects.save(p.id, changed, 1);
    assert.throws(() => ai.apply(p.id, j.id, 2), /版本|修改/);
    assert.equal(projects.get(p.id)?.lesson.title, '用户新编辑');
    assert.equal(ai.job(p.id, j.id)?.status, 'succeeded');
    assert.throws(() => ai.enqueue(p.id, 1, input, 'deepseek-flash'), /修改|版本/);
    assert.throws(() => ai.enqueue(p.id, 2, { kind: 'scene', sceneId: 'intro', instruction: '修改' }, 'deepseek-flash'), /不存在/);
  } finally { projects.close(); }
});
test('editing after AI apply prevents undo and cross-project actions are rejected', async () => {
  const { projects, ai, p } = await setup();
  try {
    const other = projects.create('其他项目');
    const j = ai.enqueue(p.id, 1, input, 'deepseek-flash'); ai.claim();
    ai.complete(j.id, { lesson: createExampleLesson('AI 草稿'), usage: null });
    assert.equal(ai.job(other.id, j.id), undefined);
    assert.throws(() => ai.apply(other.id, j.id, 1), /不存在/);
    const applied = ai.apply(p.id, j.id, 1).project;
    applied.lesson.title = '用户修改'; projects.save(p.id, applied.lesson, 2);
    assert.throws(() => ai.undo(p.id, j.id, 3), /版本|修改/);
    assert.equal(projects.get(p.id)?.lesson.title, '用户修改');
  } finally { projects.close(); }
});
test('transaction failure rolls back both project version and AI state', async () => {
  const { projects, ai, p } = await setup();
  try {
    const j = ai.enqueue(p.id, 1, input, 'deepseek-flash'); ai.claim();
    ai.complete(j.id, { lesson: createExampleLesson('AI 草稿'), usage: null });
    projects.db.exec("CREATE TRIGGER reject_apply BEFORE UPDATE ON ai_jobs WHEN NEW.status='applied' BEGIN SELECT RAISE(ABORT,'test rollback'); END;");
    assert.throws(() => ai.apply(p.id, j.id, 1), /test rollback/);
    assert.equal(projects.get(p.id)?.version, 1);
    assert.equal(projects.get(p.id)?.lesson.title, '原课程');
    assert.equal(ai.job(p.id, j.id)?.status, 'succeeded');
  } finally { projects.close(); }
});
test('discard and interrupted recovery never edit projects or silently retry requests', async () => {
  const { projects, ai, p } = await setup();
  try {
    const j = ai.enqueue(p.id, 1, input, 'deepseek-flash'); ai.claim(); ai.recoverInterrupted();
    assert.equal(ai.job(p.id, j.id)?.status, 'failed'); assert.equal(ai.claim(), undefined);
    ai.discard(p.id, j.id); assert.equal(ai.job(p.id, j.id)?.status, 'discarded');
    assert.equal(projects.get(p.id)?.version, 1);
    const next = ai.enqueue(p.id, 1, input, 'deepseek-flash');
    assert.notEqual(next.id, j.id);
    ai.claim(); ai.complete(next.id, { lesson: createExampleLesson('草稿'), usage: null });
    ai.discard(p.id, next.id); assert.equal(projects.get(p.id)?.version, 1);
  } finally { projects.close(); }
});
test('active AI jobs remain deduplicated beyond the terminal history limit', async () => {
  const { projects, ai, p } = await setup();
  try {
    const first = ai.enqueue(p.id, 1, input, 'deepseek-flash');
    for (let i = 0; i < 51; i++) {
      const j = ai.enqueue(p.id, 1, { ...input, topic: '主题' + i }, 'deepseek-flash');
      projects.db.prepare("UPDATE ai_jobs SET status='failed',payload=json_set(payload,'$.status','failed') WHERE id=?").run(j.id);
    }
    assert.equal(ai.enqueue(p.id, 1, input, 'deepseek-flash').id, first.id);
    assert(ai.list(p.id).some(j => j.id === first.id));
  } finally { projects.close(); }
});
