// Isolated end-to-end app verification. Default engine is a local WAV protocol fixture.
// VERIFY_ZIPVOICE_REAL=1 uses the installed model and an explicitly supplied synthetic test reference.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { pcmWav } from '../src/server/voices/audio.ts';
const root = resolve('data/zipvoice-app-verification', randomUUID()); mkdirSync(join(root, 'zipvoice'), { recursive: true });
// Reserve/check first. Never POST to any pre-existing listener, even if it serves this app.
const reservation = createServer();
await new Promise((yes, no) => { reservation.once('error', no); reservation.listen(Number(process.env.VERIFY_ZIPVOICE_PORT || 0), '127.0.0.1', yes); });
const port = reservation.address().port;
await new Promise(r => reservation.close(r));
const base = `http://127.0.0.1:${port}`;
let releaseHold; const hold = new Promise(r => { releaseHold = r; });
const fixture = createServer(async (req, res) => {
  if (req.url === '/__finish') { res.end('finished'); releaseHold(); return; }
  if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ready: true, model: 'zipvoice-distill-int8-v1' })); return; }
  for await (const _part of req) { /* drain request */ }
  const pcm = Buffer.alloc(48000 * 2); for (let n = 0; n < pcm.length / 2; n++) pcm.writeInt16LE(Math.round(Math.sin(n * 2 * Math.PI * 220 / 24000) * 3000), n * 2);
  res.setHeader('Content-Type', 'audio/wav'); res.end(pcmWav(pcm));
});
await new Promise(r => fixture.listen(0, '127.0.0.1', r));
const real = process.env.VERIFY_ZIPVOICE_REAL === '1';
const settings = real ? JSON.parse(readFileSync('data/zipvoice/service.json', 'utf8')) : { port: fixture.address().port, token: 'isolated-fixture' };
writeFileSync(join(root, 'zipvoice/service.json'), JSON.stringify(settings));
const env = { ...process.env, DATA_DIR: root, TTS_PROVIDER: 'tencent', TENCENT_SECRET_ID: '', TENCENT_SECRET_KEY: '', MINIMAX_API_KEY: '', DEEPSEEK_API_KEY: '', REMOTION_BROWSER_EXECUTABLE: 'C:/Program Files/Google/Chrome/Application/chrome.exe', RENDER_CONCURRENCY: '2' };
const children = [], fds = [];
function launch(args, name) { const fd = openSync(join(root, `${name}.log`), 'w'); fds.push(fd); const child = spawn(process.execPath, args, { env, windowsHide: true, stdio: ['ignore', fd, fd] }); children.push(child); return child; }
async function waitFor(check, timeout = 180000) { const end = Date.now() + timeout; while (Date.now() < end) { const value = await check(); if (value) return value; await pause(500); } throw new Error('Timed out; logs: ' + root); }
async function api(path, method = 'GET', body) { const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: base }, ...(body ? { body: JSON.stringify(body) } : {}) }); const data = await response.json(); return { status: response.status, data }; }
const transcript = real ? 'Welcome to our lesson. We will learn a new idea step by step. First we explain the concept, then look at a simple example.' : '这是系统协议验证用的录音。';
const reference = real ? readFileSync('data/zipvoice/verification/synthetic-reference.wav') : pcmWav(Buffer.alloc(48000 * 4));
async function upload(name, audio = reference, filename = 'reference.wav') {
  const form = new FormData(); form.set('name', name); form.set('referenceText', transcript); form.set('audio', new Blob([audio]), filename);
  const response = await fetch(base + '/api/voices', { method: 'POST', headers: { Origin: base }, body: form }); return { status: response.status, data: await response.json() };
}
try {
  const web = launch(['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], 'web');
  await waitFor(async () => {
    if (web.exitCode !== null) throw new Error('Owned test web process failed to start; no requests sent');
    if (!readFileSync(join(root, 'web.log'), 'utf8').includes('Ready in')) return false;
    try { return (await fetch(base)).ok; } catch { return false; }
  }, 30000);
  assert.equal((await upload('坏录音', Buffer.from('broken'))).status, 400);
  const voice1 = await upload('教学测试音色'); const voice2 = await upload('试听队列音色'); assert.equal(voice1.status, 201); assert.equal(voice2.status, 201);
  assert.equal((await api('/api/voices')).data.length, 2);
  assert.equal((await api(`/api/voices/${voice2.data.id}`, 'PATCH', { name: '改名成功' })).data.name, '改名成功');
  let project = (await api('/api/projects', 'POST', { title: 'ZipVoice 升级验收' })).data;
  const lesson = { title: 'ZipVoice 升级验收', speechProvider: 'zipvoice', scenes: [
    { id: 'intro', kind: 'title', title: '选择音色', content: '输入讲解稿\n选择本地音色', narration: '我们先选择一个保存好的音色。', durationSeconds: 3, voice: { voiceId: voice1.data.id, speed: 1 } },
    { id: 'summary', kind: 'summary', title: '生成与导出', content: '生成配音\n试听并导出', narration: '生成配音以后，就可以试听并导出视频。', durationSeconds: 3, voice: { voiceId: voice1.data.id, speed: 1.2 } }
  ] };
  project = (await api(`/api/projects/${project.id}`, 'PUT', { version: project.version, lesson })).data;
  const config = await api(`/api/tts/config?projectId=${project.id}`); assert.equal(config.data.configured, true); assert.equal(config.data.provider, 'zipvoice'); assert.ok(!JSON.stringify(config.data).includes(settings.token));
  const preview = await api(`/api/voices/${voice2.data.id}/previews`, 'POST', { text: '这是一次音色试听。' }); assert.equal(preview.status, 202);
  assert.equal((await api(`/api/voices/${voice2.data.id}`, 'PATCH', { archived: true })).status, 200);
  assert.equal((await api(`/api/voices/${voice2.data.id}/previews`, 'POST', { text: '新的试听。' })).status, 400);
  assert.equal((await api(`/api/projects/${project.id}/narrations`, 'POST', { version: project.version, sceneIds: ['intro', 'summary'] })).status, 202);
  launch(['src/worker/index.ts'], 'worker');
  await waitFor(async () => { const r = await api(`/api/voices/${voice2.data.id}/previews/${preview.data.id}`); if (r.data.status === 'failed') throw new Error(r.data.error); return r.data.status === 'succeeded'; });
  await waitFor(async () => { const r = await api(`/api/projects/${project.id}/narrations`); const failed = r.data.jobs.find(j => j.status === 'failed'); if (failed) throw new Error(failed.error); return r.data.assets.length === 2; });
  const duplicate = await api(`/api/projects/${project.id}/narrations`, 'POST', { version: project.version, sceneIds: ['intro', 'summary'] }); assert.equal(duplicate.data.reused.length, 2);
  const exp = await api(`/api/projects/${project.id}/exports`, 'POST', { version: project.version, includeAudio: true }); assert.equal(exp.status, 202);
  await waitFor(async () => { const jobs = (await api(`/api/projects/${project.id}/exports`)).data; const j = jobs.find(j => j.id === exp.data.id); if (j?.status === 'failed') throw new Error(j.error); return j?.status === 'succeeded'; });
  const download = await fetch(base + `/api/exports/${exp.data.id}/download`); assert.equal(download.status, 200); const output = join(root, 'verified.mp4'); writeFileSync(output, Buffer.from(await download.arrayBuffer()));
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', output], { encoding: 'utf8', windowsHide: true }));
  assert.ok(probe.streams.some(s => s.codec_type === 'audio')); assert.ok(probe.streams.some(s => s.codec_type === 'video'));
  const changed = structuredClone(project.lesson); changed.scenes[0].narration += '修改后重新生成。';
  const saved = await api(`/api/projects/${project.id}`, 'PUT', { version: project.version, lesson: changed });
  assert.equal((await api(`/api/projects/${project.id}/exports`, 'POST', { version: saved.data.version, includeAudio: true })).status, 400);
  // Restore unchanged text for browser verification, preserving original assets.
  await api(`/api/projects/${project.id}`, 'PUT', { version: saved.data.version, lesson: project.lesson });
  const report = { ok: true, mode: real ? 'real-model-with-synthetic-reference' : 'protocol-fixture', project: base + '/projects/' + project.id, root, output, finishUrl: `http://127.0.0.1:${fixture.address().port}/__finish` };
  writeFileSync(join(root, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  if (process.env.VERIFY_ZIPVOICE_HOLD === '1') await hold;
} finally {
  for (const child of children) child.kill();
  for (const fd of fds) closeSync(fd);
  fixture.closeAllConnections(); await new Promise(r => fixture.close(r));
}
