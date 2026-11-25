import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { pcmWav, wavInfo } from '../src/server/voices/audio.ts';
if (existsSync('.env.local')) loadEnvFile('.env.local');
const configuredData = resolve(process.env.DATA_DIR || 'data');
const root = resolve('data/voice-import-verification', randomUUID()); mkdirSync(join(root, 'zipvoice'), { recursive: true });
const reservation = createServer(); await new Promise((yes, no) => { reservation.once('error', no); reservation.listen(Number(process.env.VERIFY_IMPORT_PORT || 0), '127.0.0.1', yes); });
const port = reservation.address().port; await new Promise(r => reservation.close(r)); const base = `http://127.0.0.1:${port}`;
const real = process.env.VERIFY_IMPORT_REAL === '1'; let releaseHold; const hold = new Promise(r => { releaseHold = r; });
const pcm = Buffer.alloc(48000 * 2); for (let n = 0; n < pcm.length / 2; n++) pcm.writeInt16LE(Math.round(Math.sin(n * 2 * Math.PI * 330 / 24000) * 4000), n * 2);
const engine = createServer(async (req, res) => {
  if (req.url === '/__finish') { res.end('done'); releaseHold(); return; }
  if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ready: true, asrReady: true, model: 'zipvoice-distill-int8-v1' })); return; }
  for await (const _part of req) { /* consume fixture request */ }
  if (req.url === '/transcribe') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ text: '这是一段系统协议测试的识别文字。' })); return; }
  res.setHeader('Content-Type', 'audio/wav'); res.end(pcmWav(pcm));
});
await new Promise(r => engine.listen(0, '127.0.0.1', r));
const settings = real ? JSON.parse(readFileSync(join(configuredData, 'zipvoice/service.json'), 'utf8')) : { port: engine.address().port, token: 'test-only' };
writeFileSync(join(root, 'zipvoice/service.json'), JSON.stringify(settings));
const env = { ...process.env, DATA_DIR: root, TENCENT_SECRET_ID: '', TENCENT_SECRET_KEY: '', MINIMAX_API_KEY: '', DEEPSEEK_API_KEY: '', REMOTION_BROWSER_EXECUTABLE: 'C:/Program Files/Google/Chrome/Application/chrome.exe', RENDER_CONCURRENCY: '2' };
const children = [], fds = [];
function launch(args, label) { const fd = openSync(join(root, label + '.log'), 'w'); fds.push(fd); const child = spawn(process.execPath, args, { env, windowsHide: true, stdio: ['ignore', fd, fd] }); children.push(child); return child; }
async function waitFor(check, timeout = 180000) { const end = Date.now() + timeout; while (Date.now() < end) { const result = await check(); if (result) return result; await pause(400); } throw new Error('Timed out: ' + root); }
async function api(path, method = 'GET', body) { const response = await fetch(base + path, { method, headers: { Origin: base, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, data: await response.json() }; }
async function upload(path, name) { const response = await fetch(base + '/api/voice-imports?' + new URLSearchParams({ filename: name, start: '0', duration: '6' }), { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/octet-stream' }, body: readFileSync(path) }); return { status: response.status, data: await response.json() }; }
async function finished(id, failed = false) { return waitFor(async () => { const job = (await api('/api/voice-imports/' + id)).data; if (job.status === 'failed') { if (failed) return job; throw new Error(job.error); } return !failed && job.status === 'succeeded' ? job : false; }); }
try {
  const sourceAudio = real ? resolve(process.argv[2] || join(configuredData, 'zipvoice/verification/synthetic-reference.wav')) : join(root, 'tone.wav');
  if (!real) { const p = Buffer.alloc(48000 * 8); for (let n = 0; n < p.length / 2; n++) p.writeInt16LE(Math.round(Math.sin(n * 2 * Math.PI * 330 / 24000) * 4000), n * 2); writeFileSync(sourceAudio, pcmWav(p)); }
  const video = join(root, 'source.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=size=320x180:rate=10:duration=8', '-i', sourceAudio, '-t', '8', '-c:v', 'libx264', '-c:a', 'aac', video], { windowsHide: true });
  const mute = join(root, 'mute.mp4'); execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=size=64x64:rate=5:duration=8', '-c:v', 'libx264', mute], { windowsHide: true });
  const web = launch(['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], 'web');
  await waitFor(async () => { if (web.exitCode !== null) throw new Error('Owned web process exited'); if (!readFileSync(join(root, 'web.log'), 'utf8').includes('Ready in')) return false; try { return (await fetch(base)).ok; } catch { return false; } }, 30000);
  assert.equal((await fetch(base + '/voices')).status, 200); assert.equal((await api('/api/voice-imports/config')).data.configured, true);
  const started = Date.now(); const uploaded = await upload(video, '课堂视频.mp4'); assert.equal(uploaded.status, 202); assert.equal(uploaded.data.status, 'queued');
  assert.equal((await api('/api/voices')).data.length, 0); assert.equal((await fetch(base + `/api/voice-imports/${uploaded.data.id}/audio`)).status, 409);
  const invalid = await upload(video, '../video.mp4'); assert.equal(invalid.status, 400);
  if (!real) {
    for (let n = 0; n < 9; n++) assert.equal((await upload(video, `排队${n}.mp4`)).status, 202);
    const before = readdirSync(join(root, 'voice-imports')).length;
    assert.equal((await upload(video, '队列已满.mp4')).status, 400);
    assert.equal(readdirSync(join(root, 'voice-imports')).length, before, 'Full queue must reject before creating files');
  }
  launch(['src/worker/index.ts'], 'worker');
  const job = await finished(uploaded.data.id); assert.ok(job.transcript.trim());
  const recognitionSeconds = (Date.now() - started) / 1000;
  if (real) assert.match(job.transcript, /welcome|lesson|learn/i);
  const sound = await fetch(base + `/api/voice-imports/${job.id}/audio`); assert.equal(sound.status, 200); assert.ok(Math.abs(wavInfo(Buffer.from(await sound.arrayBuffer())).durationSeconds - 6) < .1);
  const name = real ? '视频提取真实模型验收' : '视频提取协议验收';
  const corrected = real ? job.transcript : '这是一段校对后的测试原文。';
  const saved = await api(`/api/voice-imports/${job.id}/save`, 'POST', { name, referenceText: corrected }); assert.equal(saved.status, 200); assert.equal(saved.data.referenceText, corrected);
  const duplicate = await api(`/api/voice-imports/${job.id}/save`, 'POST', { name, referenceText: corrected }); assert.equal(duplicate.data.id, saved.data.id); assert.equal((await api('/api/voices')).data.length, 1);
  const reloaded = (await api(`/api/voice-imports/${job.id}`)).data; assert.equal(reloaded.savedReferenceText, corrected); assert.equal(reloaded.savedName, name);
  const bad = await upload(mute, '无声音轨.mp4'); const rejected = await finished(bad.data.id, true); assert.match(rejected.error, /音轨/);
  let project = (await api('/api/projects', 'POST', { title: '视频提取音色验收' })).data;
  const lesson = { title: '视频提取音色验收', speechProvider: 'zipvoice', scenes: [{ id: 'intro', kind: 'title', title: '提取与识别', content: '视频提取声音\n识别并保存音色', narration: '视频里的声音已经保存，可以用来讲解新的内容。', durationSeconds: 3, voice: { voiceId: saved.data.id, speed: 1 } }] };
  project = (await api(`/api/projects/${project.id}`, 'PUT', { version: project.version, lesson })).data;
  assert.equal((await api(`/api/projects/${project.id}/narrations`, 'POST', { version: project.version, sceneIds: ['intro'] })).status, 202);
  await waitFor(async () => { const state = (await api(`/api/projects/${project.id}/narrations`)).data; if (state.jobs.some(j => j.status === 'failed')) throw new Error(state.jobs[0].error); return state.assets.length === 1; });
  const exp = await api(`/api/projects/${project.id}/exports`, 'POST', { version: project.version, includeAudio: true }); assert.equal(exp.status, 202);
  await waitFor(async () => { const j = (await api(`/api/projects/${project.id}/exports`)).data.find(j => j.id === exp.data.id); if (j?.status === 'failed') throw new Error(j.error); return j?.status === 'succeeded'; });
  const output = join(root, 'verified.mp4'); writeFileSync(output, Buffer.from(await (await fetch(base + `/api/exports/${exp.data.id}/download`)).arrayBuffer()));
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', output], { encoding: 'utf8' })); assert.ok(probe.streams.some(s => s.codec_type === 'audio'));
  const report = { ok: true, mode: real ? 'real-SenseVoice-and-ZipVoice' : 'protocol', recognitionSeconds, transcript: job.transcript, page: base + '/voices', root, output, finishUrl: `http://127.0.0.1:${engine.address().port}/__finish` };
  writeFileSync(join(root, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  if (process.env.VERIFY_IMPORT_HOLD === '1') await hold;
} finally { for (const child of children) child.kill(); for (const fd of fds) closeSync(fd); engine.closeAllConnections(); await new Promise(r => engine.close(r)); }
