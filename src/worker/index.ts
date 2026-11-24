import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { getStore } from '../server/db/index.ts';
import { dataRoot } from '../server/storage/index.ts';
import { renderJob } from '../server/rendering/index.ts';
import { acquireWorkerGuard } from '../server/jobs/worker-guard.ts';

// Dedicated SQLite transaction provides an OS-released lock on process exit.
const guard = acquireWorkerGuard(join(dataRoot(), 'worker-guard.sqlite'));
const store = getStore();
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stopping = true; console.log('正在等待当前任务结束后退出…'); });
store.recoverInterrupted();
console.log('知帧后台制作程序已启动，等待导出任务。');
try {
  while (!stopping) {
    const job = store.claim();
    if (!job) { await pause(1000); continue; }
    console.log(`开始制作 ${job.id}，项目版本 ${job.version}`);
    try {
      let last = 0;
      const output = await renderJob(job, progress => { const now = Date.now(); if (now - last > 500) { store.progress(job.id, progress); last = now; } });
      store.finish(job.id, output); console.log(`完成：${output}`);
    } catch (error) { const message = error instanceof Error ? error.message : String(error); store.fail(job.id, message); console.error(`任务失败：${message}`); }
  }
} finally { store.close(); guard.close(); }
