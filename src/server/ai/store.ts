import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ProjectStore } from '../db/store.ts';
import { parseLesson } from '../../shared/lesson.ts';
import { parseAiInput } from '../../shared/ai-validation.ts';
import type { AiInput, AiJob, AiUsage } from '../../shared/ai.ts';
import type { Lesson } from '../../shared/lesson.ts';

export class AiStore {
  projects: ProjectStore;
  constructor(projects: ProjectStore) {
    this.projects = projects;
    projects.db.exec('CREATE TABLE IF NOT EXISTS ai_jobs(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS ai_jobs_project ON ai_jobs(project_id);');
  }
  private transaction<T>(fn: () => T): T {
    const db = this.projects.db; db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  private byId(id: string): AiJob | undefined {
    const row = this.projects.db.prepare('SELECT payload FROM ai_jobs WHERE id=?').get(id);
    return row ? JSON.parse(String(row.payload)) : undefined;
  }
  private update(job: AiJob) { this.projects.db.prepare('UPDATE ai_jobs SET status=?,payload=? WHERE id=?').run(job.status, JSON.stringify(job), job.id); }
  private required(projectId: string, id: string) {
    const job = this.job(projectId, id);
    if (!job) throw new NotFoundError('AI 任务不存在');
    return job;
  }
  private project(projectId: string) {
    const project = this.projects.get(projectId);
    if (!project) throw new NotFoundError('项目不存在');
    return project;
  }
  list(projectId: string): AiJob[] {
    return this.projects.db.prepare("SELECT payload FROM ai_jobs WHERE project_id=? AND (status IN ('queued','running') OR rowid IN (SELECT rowid FROM ai_jobs WHERE project_id=? AND status NOT IN ('queued','running') ORDER BY rowid DESC LIMIT 50)) ORDER BY rowid DESC")
      .all(projectId, projectId).map(row => JSON.parse(String(row.payload)));
  }
  job(projectId: string, id: string) { const job = this.byId(id); return job?.projectId === projectId ? job : undefined; }
  enqueue(projectId: string, version: number, rawInput: AiInput, model: string): AiJob {
    const input = parseAiInput(rawInput);
    if (!Number.isInteger(version) || version < 1) throw new Error('项目版本不正确');
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(model)) throw new Error('模型名称不正确');
    return this.transaction(() => {
      const project = this.project(projectId);
      if (project.version !== version) throw new ConflictError('项目已被修改，请先重新载入或保存最新版本');
      if (input.kind === 'scene' && !project.lesson.scenes.some(s => s.id === input.sceneId)) throw new NotFoundError('要改写的小节不存在');
      const pending = this.list(projectId).find(j => j.baseVersion === version && j.model === model && JSON.stringify(j.input) === JSON.stringify(input) && ['queued', 'running'].includes(j.status));
      if (pending) return pending;
      const job: AiJob = { id: randomUUID(), projectId, baseVersion: version, model, input, sourceLesson: project.lesson, status: 'queued',
        result: null, error: null, usage: null, appliedVersion: null, undoneVersion: null, createdAt: new Date().toISOString() };
      this.projects.db.prepare('INSERT INTO ai_jobs VALUES(?,?,?,?)').run(job.id, projectId, job.status, JSON.stringify(job));
      return job;
    });
  }
  claim(): AiJob | undefined {
    return this.transaction(() => {
      const row = this.projects.db.prepare("SELECT id FROM ai_jobs WHERE status='queued' ORDER BY rowid LIMIT 1").get();
      if (!row) return;
      const job = this.byId(String(row.id))!; job.status = 'running'; this.update(job); return job;
    });
  }
  complete(id: string, result: { lesson: Lesson; usage: AiUsage | null }): AiJob {
    return this.transaction(() => {
      const job = this.byId(id);
      if (!job || job.status !== 'running') throw new Error('AI 任务不在生成状态');
      const next: AiJob = { ...job, status: 'succeeded', result: parseLesson(result.lesson), usage: result.usage, error: null };
      this.update(next); return next;
    });
  }
  fail(id: string, error: string) {
    const job = this.byId(id);
    if (job?.status === 'running') this.update({ ...job, status: 'failed', error: error.slice(0, 700) });
  }
  recoverInterrupted() {
    for (const row of this.projects.db.prepare("SELECT id FROM ai_jobs WHERE status='running'").all())
      this.fail(String(row.id), '上次后台生成中断，未自动重试，请核对 DeepSeek 用量后手动重新生成');
  }
  apply(projectId: string, id: string, version: number) {
    return this.transaction(() => {
      const job = this.required(projectId, id); const project = this.project(projectId);
      if (!Number.isInteger(version) || version < 1) throw new Error('项目版本不正确');
      if (job.status === 'applied' && project.version === job.appliedVersion && [job.baseVersion, job.appliedVersion].includes(version)) return { job, project };
      if (project.version !== version || project.version !== job.baseVersion) throw new ConflictError('课程版本已被修改，不能覆盖当前内容；请查看草稿后重新生成');
      if (job.status !== 'succeeded' || !job.result) throw new Error('此 AI 草稿当前不可应用');
      const saved = this.projects.save(projectId, job.result, version);
      const next: AiJob = { ...job, status: 'applied', appliedVersion: saved.version };
      this.update(next); return { job: next, project: saved };
    });
  }
  undo(projectId: string, id: string, version: number) {
    return this.transaction(() => {
      const job = this.required(projectId, id); const project = this.project(projectId);
      if (!Number.isInteger(version) || version < 1) throw new Error('项目版本不正确');
      if (job.status === 'undone' && project.version === job.undoneVersion && [job.appliedVersion, job.undoneVersion].includes(version)) return { job, project };
      if (project.version !== version || project.version !== job.appliedVersion) throw new ConflictError('课程版本已被修改，不能撤销这次 AI 应用');
      if (job.status !== 'applied') throw new Error('此 AI 草稿当前不可撤销');
      const saved = this.projects.save(projectId, job.sourceLesson, version);
      const next: AiJob = { ...job, status: 'undone', undoneVersion: saved.version };
      this.update(next); return { job: next, project: saved };
    });
  }
  discard(projectId: string, id: string) {
    return this.transaction(() => {
      const job = this.required(projectId, id); const project = this.project(projectId);
      if (!['succeeded', 'failed', 'discarded'].includes(job.status)) throw new Error('此 AI 任务当前不能放弃');
      const next: AiJob = { ...job, status: 'discarded' }; this.update(next); return { job: next, project };
    });
  }
}
