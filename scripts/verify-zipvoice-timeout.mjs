// Intentionally interrupts this project's idle local model, then verifies automatic recovery.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { normalizeReference } from '../src/server/voices/audio.ts';
const config = JSON.parse(readFileSync('data/zipvoice/service.json', 'utf8'));
const base = `http://127.0.0.1:${config.port}`; const headers = { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' };
const reference = await normalizeReference(readFileSync('data/zipvoice/verification/synthetic-reference.wav'));
let interrupted = false;
const started = Date.now();
try {
  const response = await fetch(base + '/synthesize', { method: 'POST', headers, signal: AbortSignal.timeout(10000), body: JSON.stringify({ text: '这是一条验证超时中断的测试，我们会停止这次推理，然后自动重新加载模型。', referenceText: 'Welcome to our lesson. We will learn a new idea step by step. First we explain the concept, then look at a simple example.', referenceAudio: reference.toString('base64'), timeoutSeconds: .1 }) });
  interrupted = !response.ok;
} catch { interrupted = true; }
assert.equal(interrupted, true, 'The timed-out inference must not return completed audio');
assert.ok(Date.now() - started < 10000);
let recovered = false;
for (let attempt = 0; attempt < 30; attempt++) {
  await pause(500);
  try { const response = await fetch(base + '/health', { headers, signal: AbortSignal.timeout(1000) }); const state = await response.json(); if (response.ok && state.ready) { recovered = true; break; } } catch { /* model reloads */ }
}
assert.equal(recovered, true, 'Local engine must become ready again after killing timed-out inference');
const report = { interrupted: true, recovered: true, elapsedSeconds: (Date.now() - started) / 1000 };
writeFileSync('data/zipvoice/verification/timeout.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
