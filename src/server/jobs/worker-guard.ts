import { DatabaseSync } from 'node:sqlite';
export function acquireWorkerGuard(path: string): DatabaseSync {
  const guard = new DatabaseSync(path);
  try {
    guard.exec('PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS worker_guard(id INTEGER PRIMARY KEY); BEGIN EXCLUSIVE;');
    return guard;
  } catch {
    guard.close();
    throw new Error('无法获取后台进程锁，可能已有 Worker 正在运行');
  }
}
