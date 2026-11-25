import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectStore } from '../src/server/db/store.ts';
import { VoiceStore } from '../src/server/voices/store.ts';
import { VoiceImportStore } from '../src/server/voices/imports.ts';
import { parseMediaSelection, voiceImportEditorValues } from '../src/shared/voice-import.ts';

test('media selection rejects unknown formats, invalid ranges and unsafe names', () => {
  assert.equal(parseMediaSelection('课堂.MP4', 10, 20).extension, 'mp4');
  for (const args of [['bad.html', 0, 20], ['../x.mp4', 0, 20], ['a.mp4', -1, 20], ['a.mp4', 0, 31], ['a.mp4', 0, 2], ['a.mp4', Infinity, 5]]) assert.throws(() => parseMediaSelection(...args as [string, number, number]));
});
test('recognition is an editable draft and save is atomic and idempotent', () => {
  const projects = new ProjectStore(':memory:');
  try {
    const imports = new VoiceImportStore(projects); const voices = new VoiceStore(projects);
    const job = imports.create({ filename: '老师.mp4', start: 2, duration: 10 });
    assert.equal(imports.claim()?.id, job.id); assert.equal(imports.claim(), undefined);
    assert.throws(() => imports.save(job.id, '老师', '原文'), /尚未/);
    imports.complete(job.id, { transcript: '识别有错字', durationSeconds: 10, hash: 'a'.repeat(64) });
    assert.equal(voices.list().length, 0);
    const saved = imports.save(job.id, '老师', '人工校对正确文字');
    assert.equal(saved.referenceText, '人工校对正确文字');
    assert.equal(imports.save(job.id, '重复保存', '不同文字').id, saved.id);
    assert.equal(voices.list().length, 1);
    assert.equal(imports.get(job.id)?.voiceId, saved.id);
    assert.equal(imports.get(job.id)?.savedReferenceText, '人工校对正确文字');
    assert.equal(imports.get(job.id)?.savedName, '老师');
    assert.deepEqual(voiceImportEditorValues(imports.get(job.id)!, { name: '另一个标签', text: '未被保存的文字' }), { name: '老师', text: '人工校对正确文字' });
    assert.throws(() => imports.complete(job.id, { transcript: '篡改', durationSeconds: 10, hash: 'b'.repeat(64) }), /状态/);
  } finally { projects.close(); }
});
test('import interruption becomes failed and cannot create a voice or overwrite ready results', () => {
  const projects = new ProjectStore(':memory:');
  try {
    const imports = new VoiceImportStore(projects); const job = imports.create({ filename: 'a.wav', start: 0, duration: 5 });
    imports.claim(); imports.recoverInterrupted();
    assert.equal(imports.get(job.id)?.status, 'failed');
    assert.throws(() => imports.save(job.id, '声音', '原文'), /尚未/);
  } finally { projects.close(); }
});
