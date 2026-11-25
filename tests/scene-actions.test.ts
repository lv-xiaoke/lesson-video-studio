import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExampleLesson, parseLesson } from '../src/shared/lesson.ts';
const actions = () => import('../src/shared/scene-actions.ts');
const comparison = { leftTitle: '顺序查找', leftPoints: ['逐个检查'], rightTitle: '二分查找', rightPoints: ['每次排除一半'] };

test('new teaching templates survive project validation and reject malformed fields', () => {
  const lesson = createExampleLesson();
  lesson.scenes[0] = { ...lesson.scenes[0], kind: 'steps', content: '读取数据\n比较结果' };
  lesson.scenes[1] = { ...lesson.scenes[1], kind: 'comparison', comparison };
  const parsed = parseLesson(lesson);
  assert.equal(parsed.scenes[0].kind, 'steps');
  assert.deepEqual(parsed.scenes[1].comparison, comparison);
  for (const invalid of [undefined, { ...comparison, leftPoints: [] }, { ...comparison, rightPoints: ['长'.repeat(61)] }]) {
    const broken = structuredClone(lesson); broken.scenes[1].comparison = invalid;
    assert.throws(() => parseLesson(broken), /对比/);
  }
  for (const content of ['一步\n'.repeat(6), '长'.repeat(81)]) {
    const broken = structuredClone(lesson); broken.scenes[0].content = content;
    assert.throws(() => parseLesson(broken), /步骤/);
  }
});

test('append and copy preserve the source and give every scene a unique identity', async () => {
  const { appendScene, duplicateScene } = await actions();
  const source = createExampleLesson();
  const before = structuredClone(source);
  const appended = appendScene(source, 'steps');
  assert.equal(appended.scenes.length, 4);
  assert.equal(appended.scenes[3].kind, 'steps');
  assert.doesNotThrow(() => parseLesson(appended));
  const copied = duplicateScene(source, 'intro');
  assert.equal(copied.scenes[1].narration, source.scenes[0].narration);
  assert.notEqual(copied.scenes[1].id, 'intro');
  assert.equal(new Set(copied.scenes.map(s => s.id)).size, 4);
  assert.deepEqual(source, before);
});

test('copy deep-clones comparison fields and does not carry the old audio identity', async () => {
  const { duplicateScene, changeSceneKind } = await actions();
  const source = createExampleLesson();
  source.scenes[0] = changeSceneKind(source.scenes[0], 'comparison');
  const copied = duplicateScene(source, 'intro');
  copied.scenes[1].comparison!.leftPoints[0] = '副本修改';
  assert.notEqual(source.scenes[0].comparison!.leftPoints[0], '副本修改');
  assert.notEqual(copied.scenes[1].id, source.scenes[0].id);
});

test('scene count and missing identifiers are guarded without mutating the lesson', async () => {
  const { appendScene, duplicateScene, removeScene } = await actions();
  const full = createExampleLesson();
  full.scenes = Array.from({ length: 20 }, (_, i) => ({ ...full.scenes[0], id: 's-' + i }));
  assert.throws(() => appendScene(full), /20/);
  assert.throws(() => duplicateScene(full, 's-0'), /20/);
  const single = createExampleLesson(); single.scenes = single.scenes.slice(0, 1);
  assert.throws(() => removeScene(single, 'intro'), /至少|最后/);
  assert.throws(() => duplicateScene(single, 'missing'), /不存在/);
  assert.throws(() => removeScene(full, 'missing'), /不存在/);
  const result = removeScene(createExampleLesson(), 'compare');
  assert.deepEqual(result.scenes.map(s => s.id), ['intro', 'summary']);
});

test('changing templates supplies required visual fields while preserving narration and voice', async () => {
  const { changeSceneKind } = await actions();
  const source = createExampleLesson().scenes[0]; source.voice = { voiceId: '101001', speed: 1.2 };
  const changed = changeSceneKind(source, 'comparison');
  assert.equal(changed.narration, source.narration); assert.deepEqual(changed.voice, source.voice);
  assert(changed.comparison?.leftPoints.length);
  assert.doesNotThrow(() => parseLesson({ title: '模板', scenes: [changed] }));
  assert.equal(source.kind, 'title');
  assert.equal(parseLesson(createExampleLesson()).scenes[1].kind, 'array');
});

test('changing to steps never silently discards existing screen text', async () => {
  const { changeSceneKind } = await actions();
  const scene = createExampleLesson().scenes[0];
  scene.content = '保留'.repeat(50);
  assert.throws(() => changeSceneKind(scene, 'steps'), /步骤/);
  assert.equal(scene.content.length, 100);
});
