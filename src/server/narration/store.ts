import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ProjectStore } from '../db/store.ts';
import { narrationSignature, providerForModel, voiceOf } from '../../shared/narration.ts';
import type { AudioTrack, NarrationAsset, SpeechJob } from '../../shared/narration.ts';
import type { Project } from '../../shared/lesson.ts';
import { VoiceStore } from '../voices/store.ts';
type Row = Record<string, unknown>;
const decode = <T>(row: Row): T => JSON.parse(String(row.payload));
export class SpeechStore {
  projects: ProjectStore;
  voices: VoiceStore;
  constructor(projects: ProjectStore) {
    this.projects = projects;
    this.voices = new VoiceStore(projects);
    projects.db.exec(`CREATE TABLE IF NOT EXISTS speech_jobs(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS speech_assets(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS speech_jobs_project ON speech_jobs(project_id);
      CREATE INDEX IF NOT EXISTS speech_assets_project ON speech_assets(project_id);`);
  }
  list(projectId: string) {
    return { assets: this.projects.db.prepare('SELECT payload FROM speech_assets WHERE project_id=? ORDER BY rowid DESC').all(projectId).map(row => decode<NarrationAsset>(row)), jobs: this.projects.db.prepare("SELECT payload FROM speech_jobs WHERE project_id=? AND (status IN ('queued','running') OR rowid IN (SELECT rowid FROM speech_jobs WHERE project_id=? AND status NOT IN ('queued','running') ORDER BY rowid DESC LIMIT 200)) ORDER BY rowid DESC").all(projectId, projectId).map(row => decode<SpeechJob>(row)) };
  }
  asset(id: string): NarrationAsset | undefined { const row = this.projects.db.prepare('SELECT payload FROM speech_assets WHERE id=?').get(id); return row ? decode<NarrationAsset>(row) : undefined; }
  job(id: string): SpeechJob | undefined { const row = this.projects.db.prepare('SELECT payload FROM speech_jobs WHERE id=?').get(id); return row ? decode<SpeechJob>(row) : undefined; }
  ready(project: Project, model?: string) { return this.list(project.id).assets.filter((asset, index, all) => (!model || asset.model === model) && project.lesson.scenes.some(s => s.id === asset.sceneId && narrationSignature(s, providerForModel(asset.model)) === asset.signature) && all.findIndex(a => a.sceneId === asset.sceneId && a.signature === asset.signature && a.model === asset.model && (!model || a.model === model)) === index); }
  enqueue(projectId: string, version: number, ids: string[], config: { model: string; pricePer10k: number | null }, force = false) {
    const db = this.projects.db; db.exec('BEGIN IMMEDIATE');
    try {
      const project = this.projects.get(projectId);
      if (!project) throw new NotFoundError('项目不存在');
      if (project.version !== version) throw new ConflictError('项目已被修改，请保存最新版本后生成配音');
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20 || new Set(ids).size !== ids.length || ids.some(id => !project.lesson.scenes.some(s => s.id === id))) throw new Error('小节选择不正确');
      const result: { jobs: SpeechJob[]; reused: NarrationAsset[] } = { jobs: [], reused: [] };
      const existing = this.list(projectId);
      for (const id of ids) {
        const scene = project.lesson.scenes.find(s => s.id === id)!;
        const provider = providerForModel(config.model);
        if (!voiceOf(scene, provider).voiceId || voiceOf(scene, provider).voiceId === 'unselected') throw new Error('请为全部所选小节选择音色');
        const reference = provider === 'zipvoice' ? this.voices.active(voiceOf(scene, provider).voiceId) : undefined;
        const signature = narrationSignature(scene, provider);
        const pending = existing.jobs.find(j => j.sceneId === id && j.signature === signature && j.model === config.model && (j.status === 'queued' || j.status === 'running'));
        if (pending) { result.jobs.push(pending); continue; }
        const reusable = existing.assets.find(a => a.sceneId === id && a.signature === signature && a.model === config.model);
        if (!force && reusable) { result.reused.push(reusable); continue; }
        const job: SpeechJob = { id: randomUUID(), projectId, sceneId: id, version, signature, text: scene.narration, model: config.model, voice: voiceOf(scene, provider), ...(reference ? { referenceHash: reference.hash } : {}), pricePer10k: config.pricePer10k, status: 'queued', error: null, createdAt: new Date().toISOString() };
        db.prepare('INSERT INTO speech_jobs VALUES(?,?,?,?)').run(job.id, projectId, job.status, JSON.stringify(job)); result.jobs.push(job);
      }
      db.exec('COMMIT'); return result;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  claim(): SpeechJob | undefined {
    const db = this.projects.db; db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare("SELECT payload FROM speech_jobs WHERE status='queued' ORDER BY rowid LIMIT 1").get();
      if (!row) { db.exec('COMMIT'); return; }
      const job = decode<SpeechJob>(row); job.status = 'running'; this.update(job); db.exec('COMMIT'); return job;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  update(job: SpeechJob) { this.projects.db.prepare('UPDATE speech_jobs SET status=?,payload=? WHERE id=?').run(job.status, JSON.stringify(job), job.id); }
  complete(id: string, result: { path: string; durationSeconds: number; bytes: number; usageCharacters: number | null }): NarrationAsset {
    const job = this.job(id); if (!job || job.status !== 'running') throw new Error('配音任务状态不正确');
    if (!Number.isFinite(result.durationSeconds) || result.durationSeconds <= 0) throw new Error('音频时长不正确');
    const asset: NarrationAsset = { id, projectId: job.projectId, sceneId: job.sceneId, signature: job.signature, model: job.model, ...result, estimatedCny: job.pricePer10k === null || result.usageCharacters === null ? null : result.usageCharacters * job.pricePer10k / 10_000, createdAt: new Date().toISOString() };
    const db = this.projects.db; db.exec('BEGIN IMMEDIATE');
    try { db.prepare('INSERT INTO speech_assets VALUES(?,?,?)').run(id, job.projectId, JSON.stringify(asset)); this.update({ ...job, status: 'succeeded' }); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
    return asset;
  }
  fail(id: string, error: string) { const job = this.job(id); if (job && job.status === 'running') this.update({ ...job, status: 'failed', error: error.slice(0, 700) }); }
  recoverInterrupted() { for (const row of this.projects.db.prepare("SELECT payload FROM speech_jobs WHERE status='running'").all()) { const job = decode<SpeechJob>(row); this.update({ ...job, status: 'failed', error: '上次合成进程中断，请核对厂商用量后手动重试' }); } }
  forExport(projectId: string, version: number, model?: string): AudioTrack[] {
    const project = this.projects.get(projectId);
    if (!project) throw new NotFoundError('项目不存在');
    if (project.version !== version) throw new ConflictError('项目已被修改，请先保存');
    const assets = this.ready(project, model);
    return project.lesson.scenes.map((scene, i) => {
      const asset = assets.find(a => a.sceneId === scene.id);
      if (!asset) throw new Error(`第 ${i + 1} 小节配音缺失或已过期，请更新配音，或选择无配音导出`);
      return { sceneId: scene.id, assetId: asset.id, durationSeconds: asset.durationSeconds };
    });
  }
}
