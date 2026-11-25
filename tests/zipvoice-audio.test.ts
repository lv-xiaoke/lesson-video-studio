import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { splitLocalText, normalizeReference, adjustSpeech, wavInfo, pcmWav } from '../src/server/voices/audio.ts';

test('local text splitting preserves every character at punctuation and unicode boundaries', () => {
  const input = '第一句话。' + '学'.repeat(203) + '这是第二句话！' + '😀'.repeat(210);
  const chunks = splitLocalText(input);
  assert.equal(chunks.join(''), input);
  assert.ok(chunks.every(s => Array.from(s).length <= 200));
  assert.throws(() => splitLocalText('  '), /文字/);
});
test('local text splitting merges short sentences into natural narration chunks', () => {
  const input = '先看这里。再看下一步。最后检查结果。';
  const chunks = splitLocalText(input);
  assert.deepEqual(chunks, [input]);
});
test('newlines are soft boundaries and do not create tiny standalone chunks', () => {
  const input = '第一步先准备数据。\n第二步再处理数据。\n第三步检查结果。';
  const chunks = splitLocalText(input);
  assert.equal(chunks.join(''), input);
  assert.ok(chunks.every(chunk => Array.from(chunk).length >= 10));
});
test('long narration splits after a complete sentence and its closing quote', () => {
  const first = '老师说：“' + '讲'.repeat(150) + '！”';
  const second = '接下来，我们用这个方法' + '练'.repeat(100) + '。';
  assert.deepEqual(splitLocalText(first + second), [first, second]);
});
test('a long line uses clause boundaries without splitting a decimal', () => {
  const first = '讲'.repeat(150) + '，';
  const second = '讲'.repeat(38) + '3.14是圆周率' + '练'.repeat(50) + '。';
  assert.deepEqual(splitLocalText(first + second), [first, second]);
});
test('reference decoder rejects corrupt, too-short and overlong files and normalizes valid WAV', async () => {
  await assert.rejects(normalizeReference(Buffer.from('not audio')), /录音/);
  await assert.rejects(normalizeReference(pcmWav(Buffer.alloc(24000 * 2))), /3～30/);
  await assert.rejects(normalizeReference(pcmWav(Buffer.alloc(24000 * 2 * 31))), /3～30/);
  const result = await normalizeReference(pcmWav(Buffer.alloc(24000 * 2 * 4)));
  assert.equal(wavInfo(result).durationSeconds, 4);
});
test('upload accepts only actual WAV or MP3 containers, rejecting renamed FLAC', async () => {
  const flac = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=200:duration=4', '-f', 'flac', 'pipe:1'], { windowsHide: true });
  await assert.rejects(normalizeReference(flac), /WAV|MP3/);
  const wav = pcmWav(Buffer.alloc(48000 * 5));
  await assert.rejects(normalizeReference(wav.subarray(0, wav.length - 48000)), /完整|损坏/);
});
test('final generated WAV duration follows 0.5x and 2x playback speed', async () => {
  const original = pcmWav(Buffer.alloc(24000 * 2 * 4));
  assert.ok(Math.abs(wavInfo(await adjustSpeech(original, 2)).durationSeconds - 2) < .15);
  assert.ok(Math.abs(wavInfo(await adjustSpeech(original, .5)).durationSeconds - 8) < .2);
  await assert.rejects(adjustSpeech(original, 0), /语速/);
});
