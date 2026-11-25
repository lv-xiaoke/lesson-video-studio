import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExampleLesson } from '../src/shared/lesson.ts';
import type { AiJob } from '../src/shared/ai.ts';
const rules = () => import('../src/shared/ai-editor.ts');
const job: AiJob = { id: 'j', projectId: 'p', baseVersion: 1, model: 'deepseek-flash',
  input: { kind: 'lesson', topic: '缓存', audience: '初学者', targetSeconds: 60 },
  sourceLesson: createExampleLesson(), result: createExampleLesson('草稿'), status: 'succeeded', error: null,
  usage: null, appliedVersion: null, undoneVersion: null, createdAt: '2026-11-25' };
test('latest undone draft stays visible instead of resurfacing an older applied draft', async () => {
  const { currentAiDraft } = await rules();
  const undone: AiJob = { ...job, id: 'latest', status: 'undone' };
  const old: AiJob = { ...job, id: 'old', status: 'applied' };
  assert.equal(currentAiDraft([undone, old])?.id, 'latest');
  assert.equal(currentAiDraft([{ ...undone, status: 'discarded' }, old])?.id, 'old');
  assert.equal(currentAiDraft([]), undefined);
});
test('history selection can revisit an earlier un-applied draft after a newer draft was applied or undone', async () => {
  const { currentAiDraft } = await rules();
  const newer: AiJob = { ...job, id: 'new', status: 'applied' };
  assert.equal(currentAiDraft([newer, job], job.id)?.id, job.id);
  assert.equal(currentAiDraft([{ ...newer, status: 'undone' }, job], job.id)?.id, job.id);
  assert.equal(currentAiDraft([newer, { ...job, status: 'discarded' }], job.id)?.id, 'new');
});
test('AI draft application is blocked by unsaved edits and newer saved versions', async () => {
  const { draftActionState } = await rules();
  assert.equal(draftActionState(job, 1, false).canApply, true);
  const dirty = draftActionState(job, 1, true);
  assert.equal(dirty.canApply, false); assert.match(dirty.reason || '', /未保存|修改/);
  const newer = draftActionState(job, 2, false);
  assert.equal(newer.canApply, false); assert.match(newer.reason || '', /版本|修改/);
});
test('AI undo is offered only before subsequent saved or unsaved edits', async () => {
  const { draftActionState } = await rules();
  const applied: AiJob = { ...job, status: 'applied', appliedVersion: 2 };
  assert.equal(draftActionState(applied, 2, false).canUndo, true);
  assert.equal(draftActionState(applied, 3, false).canUndo, false);
  assert.equal(draftActionState(applied, 2, true).canUndo, false);
});
test('unfinished, failed, discarded, undone or missing-result jobs cannot be applied', async () => {
  const { draftActionState } = await rules();
  for (const status of ['queued', 'running', 'failed', 'discarded', 'undone'] as const) {
    const state = draftActionState({ ...job, status }, 1, false);
    assert.equal(state.canApply, false); assert.equal(state.canUndo, false);
  }
  assert.equal(draftActionState({ ...job, result: null }, 1, false).canApply, false);
});
