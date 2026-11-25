// End-to-end protocol fixture. Never uses real vendor credentials or calls a vendor.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';

const root = resolve('data/ai-verification', randomUUID()); mkdirSync(root, { recursive: true });
const port = Number(process.env.VERIFY_AI_PORT || 3103);
const base = 'http://127.0.0.1:' + port;
const lesson = { title: '理解缓存', scenes: [
  { kind: 'steps', title: '缓存的三个步骤', content: '检查缓存\n未命中时计算\n保存结果', narration: '先检查缓存，没有结果时再计算，最后保存结果。', durationSeconds: 3 },
  { kind: 'comparison', title: '缓存前后有什么不同', content: '两种处理方式', narration: '没有缓存需要重复计算，使用缓存可以复用结果。', durationSeconds: 3,
    comparison: { leftTitle: '没有缓存', leftPoints: ['重复计算'], rightTitle: '使用缓存', rightPoints: ['复用结果'] } },
] };
let aiCalls = 0, ttsCalls = 0, failNext = '';
let finishHold;
const hold = new Promise(resolveHold => { finishHold = resolveHold; });
const pcm = Buffer.alloc(32000);
for (let i = 0; i < 16000; i++) pcm.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / 16000) * 3000), i * 2);
const fixture = createServer(async (req, res) => {
  if (req.url === '/__finish') { res.end('finished'); finishHold(); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  try {
    const body = JSON.parse(raw);
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/chat/completions') {
      assert.equal(req.headers.authorization, 'Bearer fixture-only'); aiCalls++;
      assert.deepEqual(body.response_format, { type: 'json_object' }); assert.equal(body.stream, false);
      const task = JSON.parse(body.messages[1].content).task;
      const failure = failNext; failNext = '';
      if (failure === 'timeout') return; // Exercise the production 120-second abort without a vendor call.
      if (failure === 'disconnect') { req.socket.destroy(); return; }
      if (failure === 'quota' || failure === 'rate') { res.statusCode = failure === 'quota' ? 402 : 429; res.end(JSON.stringify({ error: { message: 'fixture-only' } })); return; }
      const result = task.kind === 'scene' ? { scene: { ...lesson.scenes[0], id: 'injected', voice: { voiceId: '402000', speed: 2 }, narration: '我们先用生活中的例子理解缓存，再观察结果如何复用。' } } : lesson;
      res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: failure === 'json' ? '{' : JSON.stringify(result) } }], usage: { prompt_tokens: 100, completion_tokens: 200 } }));
    } else {
      ttsCalls++;
      assert.equal(body.Codec, 'pcm'); assert.equal(body.SampleRate, 16000);
      res.end(JSON.stringify({ Response: { Audio: pcm.toString('base64'), SessionId: body.SessionId, RequestId: 'fixture' } }));
    }
  } catch { res.statusCode = 400; res.end('{}'); }
});
await new Promise(r => fixture.listen(0, '127.0.0.1', r));
const fixturePort = fixture.address().port;
const env = { ...process.env, DATA_DIR: root, DEEPSEEK_API_KEY: 'fixture-only', DEEPSEEK_MODEL: 'deepseek-flash',
  DEEPSEEK_API_ENDPOINT: 'http://127.0.0.1:' + fixturePort + '/chat/completions', TTS_PROVIDER: 'tencent',
  TENCENT_SECRET_ID: 'fixture-id', TENCENT_SECRET_KEY: 'fixture-key', TENCENT_TTS_ENDPOINT: 'http://127.0.0.1:' + fixturePort + '/',
  MINIMAX_API_KEY: '', REMOTION_BROWSER_EXECUTABLE: process.env.REMOTION_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', RENDER_CONCURRENCY: '2' };
const children = [], fds = [];
function launch(args, label) {
  const fd = openSync(join(root, label + '.log'), 'w'); fds.push(fd);
  children.push(spawn(process.execPath, args, { cwd: process.cwd(), env, windowsHide: true, stdio: ['ignore', fd, fd] }));
}
async function waitFor(check, timeout = 90_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await check(); if (value) return value; await pause(300); }
  throw new Error('Verification timed out; logs: ' + root);
}
async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { Origin: base, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  const text = await response.text(); let data;
  try { data = JSON.parse(text); } catch { data = { text: text.slice(0, 100) }; }
  return { status: response.status, data };
}
let project;
const path = () => '/api/projects/' + project.id + '/ai';
const current = () => api('/api/projects/' + project.id);
async function enqueue(input) {
  const result = await api(path(), 'POST', { version: project.version, input }); assert.equal(result.status, 202); return result.data;
}
async function finished(id, fail = false) {
  return waitFor(async () => {
    const jobs = (await api(path())).data; const job = jobs.find(j => j.id === id);
    if (job?.status === 'failed') { if (fail) return job; throw new Error(job.error); }
    return !fail && job?.status === 'succeeded' ? job : false;
  }, 150_000);
}
async function action(job, actionName, version = project.version) {
  return api(path() + '/' + job.id, 'POST', { action: actionName, version });
}
const input = { kind: 'lesson', topic: '缓存', audience: '初学者', targetSeconds: 60 };
try {
  launch(['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], 'web');
  await waitFor(async () => { try { return (await fetch(base, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } }, 30_000);
  const config = await api('/api/ai/config'); assert.equal(config.status, 200, 'AI configuration route must exist in built app');
  assert.equal(config.data.configured, true); assert.equal(config.data.provider, 'deepseek');
  assert.deepEqual(Object.keys(config.data).sort(), ['configured', 'model', 'provider']);
  project = (await api('/api/projects', 'POST', { title: 'AI 课程验收（本机模拟）' })).data;
  const queued = await enqueue(input); const duplicate = await enqueue(input); assert.equal(duplicate.id, queued.id);
  launch(['src/worker/index.ts'], 'worker');
  const ready = await finished(queued.id); assert.equal(aiCalls, 1); assert.equal(ttsCalls, 0);
  assert.equal((await current()).data.version, 1);
  const other = (await api('/api/projects', 'POST', { title: '隔离检查' })).data;
  assert.equal((await api('/api/projects/' + other.id + '/ai/' + ready.id, 'POST', { action: 'apply', version: other.version })).status, 404);
  project = (await action(ready, 'apply')).data.project; assert.equal(project.version, 2);
  assert.equal((await action(ready, 'apply', 1)).data.project.version, 2);
  project = (await action(ready, 'undo')).data.project; assert.equal(project.version, 3);
  assert.equal((await action(ready, 'undo', 2)).data.project.version, 3);
  const second = await finished((await enqueue(input)).id);
  project = (await action(second, 'apply')).data.project;
  project.lesson.scenes[0].voice = { voiceId: '101001', speed: 1.2 };
  project = (await api('/api/projects/' + project.id, 'PUT', { lesson: project.lesson, version: project.version })).data;
  const audioPath = '/api/projects/' + project.id + '/narrations';
  assert.equal((await api(audioPath, 'POST', { version: project.version, sceneIds: project.lesson.scenes.map(s => s.id) })).status, 202);
  let audio = await waitFor(async () => { const r = await api(audioPath); return r.data.assets.length === 2 ? r.data : false; });
  const sample = await fetch(base + audioPath + '/' + audio.assets[0].id, { headers: { Range: 'bytes=0-99' }, signal: AbortSignal.timeout(10_000) });
  assert.equal(sample.status, 206); assert.equal((await sample.arrayBuffer()).byteLength, 100);
  assert.equal(sample.headers.get('content-type'), 'audio/wav');
  const preserved = audio.assets.find(a => a.sceneId === project.lesson.scenes[1].id).id;
  const rewrite = await finished((await enqueue({ kind: 'scene', sceneId: project.lesson.scenes[0].id, instruction: '用生活例子解释' })).id);
  const original = structuredClone(project.lesson);
  project = (await action(rewrite, 'apply')).data.project;
  assert.equal(project.lesson.scenes[0].id, original.scenes[0].id);
  assert.deepEqual(project.lesson.scenes[0].voice, original.scenes[0].voice);
  assert.deepEqual(project.lesson.scenes[1], original.scenes[1]);
  assert.equal((await api('/api/projects/' + project.id + '/exports', 'POST', { version: project.version, includeAudio: true })).status, 400);
  await api(audioPath, 'POST', { version: project.version, sceneIds: [project.lesson.scenes[0].id] });
  audio = await waitFor(async () => { const r = await api(audioPath); return r.data.assets.length === 3 ? r.data : false; });
  assert(audio.assets.some(a => a.id === preserved));
  const conflict = await enqueue(input);
  project.lesson.title = '用户后续编辑';
  project = (await api('/api/projects/' + project.id, 'PUT', { lesson: project.lesson, version: project.version })).data;
  await finished(conflict.id); assert.equal((await action(conflict, 'apply')).status, 409);
  await action(conflict, 'discard');
  const ttsBefore = ttsCalls;
  for (const mode of ['quota', 'rate', 'json', 'disconnect', 'timeout']) {
    const before = aiCalls; failNext = mode;
    const failed = await finished((await enqueue(input)).id, true);
    assert(!failed.error.includes('fixture-only')); await pause(500); assert.equal(aiCalls, before + 1);
    await action(failed, 'discard');
  }
  assert.equal((await current()).data.version, project.version);
  assert.equal(ttsCalls, ttsBefore);
  const exportPath = '/api/projects/' + project.id + '/exports';
  const render = await api(exportPath, 'POST', { version: project.version, includeAudio: true }); assert.equal(render.status, 202);
  const done = await waitFor(async () => { const job = (await api(exportPath)).data.find(j => j.id === render.data.id);
    if (job.status === 'failed') throw new Error(job.error); return job.status === 'succeeded' ? job : false; }, 180_000);
  const output = join(root, done.output);
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name:format=duration', '-of', 'json', output], { encoding: 'utf8', windowsHide: true }));
  assert(info.streams.some(s => s.codec_name === 'h264')); assert(info.streams.some(s => s.codec_name === 'aac'));
  assert(Math.abs(Number(info.format.duration) - 6) < 0.1);
  const result = { fixtureOnly: true, aiCalls, ttsCalls, duration: info.format.duration, output, projectId: project.id, fixturePort, webPort: port, editorUrl: base + '/projects/' + project.id };
  writeFileSync(join(root, 'result.json'), JSON.stringify(result, null, 2));
  console.log('PASS: AI draft lifecycle, idempotency, rewrite isolation, conflicts, no automatic retries, audio reuse and MP4.');
  console.log(JSON.stringify(result));
  if (process.env.VERIFY_AI_HOLD === '1') {
    console.log('Holding fixture services for browser QA; POST /__finish on fixture port to close.');
    const timer = setTimeout(finishHold, 20 * 60_000);
    try { await hold; } finally { clearTimeout(timer); }
  }
} finally {
  for (const child of children) if (child.exitCode === null) child.kill();
  await pause(500); for (const fd of fds) closeSync(fd);
  fixture.closeAllConnections(); fixture.close();
}
