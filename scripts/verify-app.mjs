// Run against a local Web + Worker instance. Creates one clearly named sample project.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';
const base = process.env.VERIFY_URL || 'http://127.0.0.1:3000';
async function api(path, method = 'GET', body) {
  return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: base }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const page = await fetch(base);
assert.equal(page.status, 200);
assert((await page.text()).includes('知帧'));
let response = await api('/api/projects', 'POST', { title: '二分查找 · 本地验收样片' });
assert.equal(response.status, 201);
let project = await response.json();
project.lesson.scenes.forEach(scene => { scene.durationSeconds = 3; });
response = await api(`/api/projects/${project.id}`, 'PUT', { lesson: project.lesson, version: project.version });
assert.equal(response.status, 200);
project = await response.json();
assert.equal(project.version, 2);
response = await api(`/api/projects/${project.id}`, 'PUT', { lesson: project.lesson, version: 1 });
assert.equal(response.status, 409);
const restored = await (await api(`/api/projects/${project.id}`)).json();
assert.equal(restored.version, 2);
assert.equal(restored.lesson.scenes[0].durationSeconds, 3);
response = await api(`/api/projects/${project.id}/exports`, 'POST', { version: project.version });
assert.equal(response.status, 202);
const initialJob = await response.json();
console.log('PASS: homepage, same-origin create/save, restored project, stale-version rejection, queued export.');
console.log(`Preview: ${base}/projects/${project.id}`);
const deadline = Date.now() + 180_000;
let previousStatus = '';
let finished;
while (Date.now() < deadline) {
  const jobs = await (await api(`/api/projects/${project.id}/exports`)).json();
  const job = jobs.find(item => item.id === initialJob.id);
  if (job.status !== previousStatus) { console.log('Export:', job.status); previousStatus = job.status; }
  if (job.status === 'failed') throw new Error(job.error);
  if (job.status === 'succeeded') { finished = job; break; }
  await pause(1000);
}
assert(finished, 'Worker did not complete the export before the deadline');
const download = await fetch(`${base}/api/exports/${finished.id}/download`);
assert.equal(download.status, 200);
assert.equal(download.headers.get('content-type'), 'video/mp4');
const bytes = Buffer.from(await download.arrayBuffer());
assert(bytes.length > 1000);
assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
await mkdir('data', { recursive: true });
await writeFile('data/verification.json', JSON.stringify({ projectId: project.id, jobId: finished.id, preview: `${base}/projects/${project.id}`, output: finished.output, bytes: bytes.length }, null, 2));
console.log(`PASS: actual Worker MP4 export and download, ${bytes.length} bytes.`);
