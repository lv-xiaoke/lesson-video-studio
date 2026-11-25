// Real CPU model smoke test. Reference must be provided explicitly; never uses bundled celebrity demos.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { normalizeReference, wavInfo } from '../src/server/voices/audio.ts';
const referenceFile = process.argv[2]; const referenceText = process.argv[3];
if (!referenceFile || !referenceText) throw new Error('Usage: node scripts/verify-zipvoice-engine.mjs <reference.wav> <exact-transcript>');
const root = resolve('data/zipvoice'); const settings = JSON.parse(readFileSync(join(root, 'service.json'), 'utf8'));
const headers = { Authorization: `Bearer ${settings.token}`, 'Content-Type': 'application/json' };
const base = `http://127.0.0.1:${settings.port}`;
const health = await (await fetch(base + '/health', { headers })).json();
if (!health.ready) throw new Error('Model not ready');
const audio = await normalizeReference(readFileSync(referenceFile));
const text = '今天我们学习如何把文字变成教学视频。首先准备清楚的讲解稿，然后选择保存好的音色，生成每个小节的声音。接着检查发音和节奏，让画面按照声音的长度播放。最后合成为一个完整的视频，方便反复观看和分享给其他同学。';
const dir = join(root, 'verification'); mkdirSync(dir, { recursive: true });
const results = [];
for (const run of ['first', 'warm']) {
  const start = performance.now();
  const response = await fetch(base + '/synthesize', { method: 'POST', headers, body: JSON.stringify({ text, referenceText, referenceAudio: audio.toString('base64') }), signal: AbortSignal.timeout(900000) });
  if (!response.ok) throw new Error(`Engine returned ${response.status}: ${await response.text()}`);
  const wav = Buffer.from(await response.arrayBuffer()); const seconds = wavInfo(wav).durationSeconds;
  writeFileSync(join(dir, `${run}.wav`), wav);
  const elapsed = (performance.now() - start) / 1000;
  results.push({ run, characters: Array.from(text).length, generationSeconds: +elapsed.toFixed(2), audioSeconds: +seconds.toFixed(2), realTimeFactor: +(elapsed / seconds).toFixed(2) });
  console.log(JSON.stringify(results.at(-1)));
}
writeFileSync(join(dir, 'benchmark.json'), JSON.stringify({ reference: 'Explicit synthetic test reference; not human voice quality acceptance', model: health.model, loadSeconds: health.loadSeconds, results }, null, 2));
