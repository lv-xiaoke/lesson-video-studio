// Protocol fixture only: synthesizes a test tone, never calls MiniMax or uses a real key.
// Requires a completed `npm run build`, Chrome, ffmpeg and ffprobe.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { totalFrames } from '../src/video/timeline/index.ts';

const root = resolve('data/narration-verification', randomUUID());
mkdirSync(root, { recursive: true });
const source = join(root, 'fixture-tone.mp3');
execFileSync(process.env.FFMPEG_EXECUTABLE || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4.2', '-ar', '32000', '-ac', '1', '-c:a', 'libmp3lame', source], { windowsHide: true });
const metadata = JSON.parse(execFileSync(process.env.FFPROBE_EXECUTABLE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', source], { encoding: 'utf8', windowsHide: true }));
const duration = Number(metadata.format.duration);
const bytes = readFileSync(source);
let calls = 0, failNext = false;
const fixture = createServer(async (request, response) => {
  let input = ''; for await (const chunk of request) input += chunk;
  try {
    const payload = JSON.parse(input);
    assert.equal(request.headers.authorization, 'Bearer fixture-not-a-real-key');
    assert.equal(payload.audio_setting.format, 'mp3');
    assert.equal(payload.stream, false); assert.equal(payload.output_format, 'hex');
    assert(payload.voice_setting.voice_id); assert(payload.text);
    calls++;
    response.setHeader('Content-Type', 'application/json');
    if (failNext) { failNext = false; response.end(JSON.stringify({ base_resp: { status_code: 1008, status_msg: 'fixture failure' }, data: null })); return; }
    response.end(JSON.stringify({ base_resp: { status_code: 0 }, data: { audio: bytes.toString('hex'), status: 2 }, extra_info: { audio_length: Math.round(duration * 1000), usage_characters: Array.from(payload.text).length } }));
  } catch { response.statusCode = 400; response.end('{}'); }
});
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
const fixturePort = fixture.address().port;
const webPort = Number(process.env.VERIFY_NARRATION_PORT || 3101);
const base = `http://127.0.0.1:${webPort}`;
const env = { ...process.env, DATA_DIR: root, MINIMAX_API_KEY: 'fixture-not-a-real-key', MINIMAX_TTS_MODEL: 'speech-2.6-hd', MINIMAX_PRICE_PER_10K_CHARS: '3.5', MINIMAX_TTS_ENDPOINT: `http://127.0.0.1:${fixturePort}/v1/t2a_v2`, REMOTION_BROWSER_EXECUTABLE: process.env.REMOTION_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', RENDER_CONCURRENCY: '2' };
const children = [], descriptors = [];
function launch(args, name) {
  const fd = openSync(join(root, name + '.log'), 'w'); descriptors.push(fd);
  const child = spawn(process.execPath, args, { cwd: process.cwd(), env, windowsHide: true, stdio: ['ignore', fd, fd] });
  children.push(child); return child;
}
async function waitFor(check, timeout = 120_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await check(); if (result) return result; await pause(500); }
  throw new Error('Verification timed out; inspect logs in ' + root);
}
async function api(path, method = 'GET', body) {
  const r = await fetch(base + path, { method, headers: { Origin: base, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}
try {
  launch(['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(webPort)], 'web');
  await waitFor(async () => { try { return (await fetch(base)).ok; } catch { return false; } }, 45_000);
  const config = await api('/api/tts/config'); assert.equal(config.data.configured, true);
  assert(!JSON.stringify(config.data).includes('fixture-not-a-real-key'));
  let result = await api('/api/projects', 'POST', { title: '配音协议验收（测试音，不是真人配音）' });
  assert.equal(result.status, 201); let project = result.data;
  project.lesson.scenes.forEach((s, i) => { s.durationSeconds = 3; s.narration = ['先看有序数据。', '比较中间的数字。', '缩小范围后继续。'][i]; });
  result = await api(`/api/projects/${project.id}`, 'PUT', { lesson: project.lesson, version: project.version });
  assert.equal(result.status, 200); project = result.data;
  const path = `/api/projects/${project.id}/narrations`;
  const ids = project.lesson.scenes.map(s => s.id);
  const body = { version: project.version, sceneIds: ids };
  const queued = await api(path, 'POST', body);
  const duplicate = await api(path, 'POST', body);
  assert.equal(queued.status, 202);
  assert.deepEqual(duplicate.data.jobs.map(j => j.id), queued.data.jobs.map(j => j.id));
  launch(['src/worker/index.ts'], 'worker');
  let state = await waitFor(async () => { const r = await api(path); if (r.data.jobs.some(j => j.status === 'failed')) throw new Error(JSON.stringify(r.data.jobs)); return r.data.assets.length === 3 ? r.data : false; });
  assert.equal(calls, 3);
  const preserved = state.assets.find(a => a.sceneId === 'compare').id;
  const audio = await fetch(`${base}${path}/${state.assets[0].id}`, { headers: { Range: 'bytes=0-99' } });
  assert.equal(audio.status, 206); assert.equal((await audio.arrayBuffer()).byteLength, 100);
  project.lesson.scenes[0].title = '只改画面，不改声音';
  project = (await api(`/api/projects/${project.id}`, 'PUT', { lesson: project.lesson, version: project.version })).data;
  result = await api(path, 'POST', { version: project.version, sceneIds: ['intro'] });
  assert.equal(result.data.reused.length, 1); assert.equal(calls, 3);
  console.log('PASS: configuration redaction, actual HTTP protocol, queue dedupe, audio ranges, visual-edit reuse.');
  failNext = true;
  result = await api(path, 'POST', { version: project.version, sceneIds: ['intro'], force: true });
  const failedId = result.data.jobs[0].id;
  await waitFor(async () => { const r = await api(path); return r.data.jobs.some(j => j.id === failedId && j.status === 'failed'); });
  assert.equal(calls, 4); await pause(1200); assert.equal(calls, 4);
  result = await api(path, 'POST', { version: project.version, sceneIds: ['intro'], force: true });
  const retryId = result.data.jobs[0].id;
  await waitFor(async () => (await api(path)).data.assets.some(a => a.id === retryId));
  project.lesson.scenes[0].narration = '更新后的第一节讲解。';
  project = (await api(`/api/projects/${project.id}`, 'PUT', { lesson: project.lesson, version: project.version })).data;
  result = await api(`/api/projects/${project.id}/exports`, 'POST', { version: project.version, includeAudio: true });
  assert.equal(result.status, 400);
  result = await api(path, 'POST', { version: project.version, sceneIds: ['intro'] });
  const updatedId = result.data.jobs[0].id;
  state = await waitFor(async () => { const r = await api(path); return r.data.assets.some(a => a.id === updatedId) ? r.data : false; });
  assert.equal(calls, 6); assert(state.assets.some(a => a.id === preserved));
  console.log('PASS: business failure, no automatic paid retry, manual retry, changed-text invalidation, per-scene reuse.');
  result = await api(`/api/projects/${project.id}/exports`, 'POST', { version: project.version, includeAudio: true });
  assert.equal(result.status, 202); const exportJob = result.data;
  assert.equal(exportJob.audio.length, 3);
  project.lesson.title = '排队后继续编辑';
  await api(`/api/projects/${project.id}`, 'PUT', { lesson: project.lesson, version: project.version });
  const finished = await waitFor(async () => { const r = await api(`/api/projects/${project.id}/exports`); const j = r.data.find(j => j.id === exportJob.id); if (j.status === 'failed') throw new Error(j.error); return j.status === 'succeeded' ? j : false; }, 180_000);
  assert.equal(finished.version, exportJob.version);
  const exported = join(root, finished.output);
  const info = JSON.parse(execFileSync(process.env.FFPROBE_EXECUTABLE || 'ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name:format=duration', '-of', 'json', exported], { encoding: 'utf8', windowsHide: true }));
  assert(info.streams.some(s => s.codec_type === 'audio'));
  const tracks = Object.fromEntries(project.lesson.scenes.map(s => [s.id, { durationSeconds: duration, src: '' }]));
  const expected = totalFrames(project.lesson.scenes, 30, tracks) / 30;
  assert(Math.abs(Number(info.format.duration) - expected) < 0.15);
  const download = await fetch(`${base}/api/exports/${finished.id}/download`);
  assert.equal(download.status, 200); assert((await download.arrayBuffer()).byteLength > 1000);
  writeFileSync(join(root, 'result.json'), JSON.stringify({ fixtureOnly: true, apiCalls: calls, expectedDuration: expected, actualDuration: info.format.duration, streams: info.streams, output: exported }, null, 2));
  console.log(`PASS: immutable audio snapshot, real MP4 with audio, ${info.format.duration}s, download. Fixture only; no real MiniMax request.`);
  console.log('Verification artifacts: ' + root);
} finally {
  for (const child of children) if (child.exitCode === null) child.kill();
  await pause(500);
  for (const fd of descriptors) closeSync(fd);
  fixture.closeAllConnections(); fixture.close();
}
