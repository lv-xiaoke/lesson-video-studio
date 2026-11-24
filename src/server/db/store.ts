import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { createExampleLesson, parseLesson } from '../../shared/lesson.ts';
import type { Lesson, Project } from '../../shared/lesson.ts';
import type { Job } from '../../shared/job.ts';
import type { AudioTrack } from '../../shared/narration.ts';

type Row = Record<string, unknown>;
const decodeProject = (row: Row): Project => ({ id: String(row.id), version: Number(row.version), updatedAt: String(row.updated_at), lesson: parseLesson(JSON.parse(String(row.lesson))) });
const decodeJob = (row: Row): Job => ({ id: String(row.id), projectId: String(row.project_id), version: Number(row.version), lesson: parseLesson(JSON.parse(String(row.lesson))), status: row.status as Job['status'], progress: Number(row.progress), output: row.output as string | null, error: row.error as string | null, createdAt: String(row.created_at), updatedAt: String(row.updated_at), audio: JSON.parse(String(row.audio || '[]')) });

export class ConflictError extends Error {}
export class NotFoundError extends Error {}

export class ProjectStore {
  db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, version INTEGER NOT NULL, lesson TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version INTEGER NOT NULL, lesson TEXT NOT NULL, status TEXT NOT NULL, progress REAL NOT NULL, output TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS jobs_project ON jobs(project_id,created_at);
      CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status,created_at);`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.db.prepare('PRAGMA table_info(jobs)').all().some(row => row.name === 'audio')) this.db.exec("ALTER TABLE jobs ADD COLUMN audio TEXT NOT NULL DEFAULT '[]'");
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
  list(): Project[] { return this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all().map(row => decodeProject(row)); }
  get(id: string): Project | undefined { const row = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id); return row ? decodeProject(row) : undefined; }
  create(title: string): Project {
    const lesson = parseLesson(createExampleLesson(title));
    const id = randomUUID();
    this.db.prepare('INSERT INTO projects VALUES(?,?,?,?)').run(id, 1, JSON.stringify(lesson), new Date().toISOString());
    return this.get(id)!;
  }
  save(id: string, input: unknown, version: number): Project {
    const lesson = parseLesson(input);
    if (!Number.isInteger(version) || version < 1) throw new Error('版本号不正确');
    const result = this.db.prepare('UPDATE projects SET lesson=?, version=version+1, updated_at=? WHERE id=? AND version=?').run(JSON.stringify(lesson), new Date().toISOString(), id, version);
    if (!result.changes) {
      if (!this.get(id)) throw new NotFoundError('项目不存在');
      throw new ConflictError('项目已被修改，请重新载入后再保存；当前草稿仍保留在页面中');
    }
    return this.get(id)!;
  }
  enqueue(projectId: string, version: number, audio: AudioTrack[] = []): Job {
    const project = this.get(projectId);
    if (!project) throw new NotFoundError('项目不存在');
    if (project.version !== version) throw new ConflictError('项目已被修改，请保存最新版本后导出');
    const id = randomUUID(); const now = new Date().toISOString();
    this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, projectId, version, JSON.stringify(project.lesson), 'queued', 0, null, null, now, now, JSON.stringify(audio));
    return this.job(id)!;
  }
  jobs(projectId: string): Job[] { return this.db.prepare('SELECT * FROM jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 20').all(projectId).map(row => decodeJob(row)); }
  job(id: string): Job | undefined { const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id); return row ? decodeJob(row) : undefined; }
  claim(): Job | undefined {
    const row = this.db.prepare("UPDATE jobs SET status='running', updated_at=? WHERE id=(SELECT id FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1) AND status='queued' RETURNING *").get(new Date().toISOString());
    return row ? decodeJob(row) : undefined;
  }
  progress(id: string, progress: number) { this.db.prepare("UPDATE jobs SET progress=?, updated_at=? WHERE id=? AND status='running'").run(Math.min(0.99, Math.max(0, progress)), new Date().toISOString(), id); }
  finish(id: string, output: string) { this.db.prepare("UPDATE jobs SET status='succeeded', progress=1, output=?, updated_at=? WHERE id=? AND status='running'").run(output, new Date().toISOString(), id); }
  fail(id: string, error: string) { this.db.prepare("UPDATE jobs SET status='failed', error=?, updated_at=? WHERE id=? AND status='running'").run(error.slice(0, 1000), new Date().toISOString(), id); }
  recoverInterrupted() { this.db.prepare("UPDATE jobs SET status='failed',error='上次后台进程在制作中退出，请重新导出',updated_at=? WHERE status='running'").run(new Date().toISOString()); }
}
