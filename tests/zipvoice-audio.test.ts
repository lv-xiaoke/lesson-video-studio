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
