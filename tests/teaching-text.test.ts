import { test } from 'node:test';
import assert from 'node:assert/strict';
const layout = () => import('../src/video/scenes/text-layout.ts');
test('a three-second summary reveals every bullet before its final frame', async () => {
  const { teachingTextLayout, teachingTextOpacity } = await layout();
  const content = Array.from({ length: 8 }, (_, i) => `要点${i + 1}`).join('\n');
  const result = teachingTextLayout(content, 'summary');
  assert.equal(result.paragraphs.length, 8);
  for (let i = 0; i < 8; i++) assert.equal(teachingTextOpacity(89, i), 1);
  assert(result.estimatedHeight <= 425);
});
test('long title/summary copy fits the content region and retains every character', async () => {
  const { teachingTextLayout } = await layout();
  for (const kind of ['title', 'summary'] as const) for (const size of [500, 1000]) {
    const content = '缓存知识'.repeat(250).slice(0, size);
    const result = teachingTextLayout(content, kind);
    assert.equal(result.paragraphs.join(''), content);
    assert(result.estimatedHeight <= 425); assert(result.fontSize >= 20);
  }
  const many = teachingTextLayout(Array(200).fill('要点').join('\n'), 'summary');
  assert.equal(many.paragraphs.join('').replaceAll(' ', ''), '要点'.repeat(200));
  assert(many.estimatedHeight <= 425);
});
