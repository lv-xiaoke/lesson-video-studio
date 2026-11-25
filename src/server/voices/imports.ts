import { randomUUID } from 'node:crypto';
import { ProjectStore, NotFoundError } from '../db/store.ts';
import { parseMediaSelection } from '../../shared/voice-import.ts';
import { VoiceImportError } from '../../shared/voice-import.ts';
import type { VoiceImport } from '../../shared/voice-import.ts';
import { VoiceStore } from './store.ts';
const decode = (row: Record<string, unknown>) => JSON.parse(String(row.payload)) as VoiceImport;
export class VoiceImportStore {
  projects: ProjectStore;
  constructor(projects: ProjectStore) { this.projects = projects; projects.db.exec('CREATE TABLE IF NOT EXISTS voice_imports(id TEXT PRIMARY KEY,status TEXT NOT NULL,payload TEXT NOT NULL)'); }
  list() { return this.projects.db.prepare('SELECT payload FROM voice_imports ORDER BY rowid DESC LIMIT 50').all().map(decode); }
  get(id: string) { const row = this.projects.db.prepare('SELECT payload FROM voice_imports WHERE id=?').get(id); return row ? decode(row) : undefined; }
  ensureCapacity() { if (this.projects.db.prepare("SELECT id FROM voice_imports WHERE status IN ('queued','running') LIMIT 10").all().length >= 10) throw new VoiceImportError('导入任务较多，请等待已有任务完成'); }
  create(input: { filename: string; start: number; duration: number }, id = randomUUID()) {
    const value = parseMediaSelection(input.filename, input.start, input.duration);
    this.ensureCapacity();
    const job: VoiceImport = { ...value, id, sourcePath: `voice-imports/${id}/source.${value.extension}`, audioPath: `voice-imports/${id}/reference.wav`, status: 'queued', transcript: null, durationSeconds: null, hash: null, voiceId: null, error: null, createdAt: new Date().toISOString() };
    this.projects.db.prepare('INSERT INTO voice_imports VALUES(?,?,?)').run(id, job.status, JSON.stringify(job)); return job;
  }
  claim() {
    const db = this.projects.db; db.exec('BEGIN IMMEDIATE');
    try { const row = db.prepare("SELECT payload FROM voice_imports WHERE status='queued' ORDER BY rowid LIMIT 1").get(); if (!row) { db.exec('COMMIT'); return; } const job = decode(row); job.status = 'running'; this.update(job); db.exec('COMMIT'); return job; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  private update(job: VoiceImport) { this.projects.db.prepare('UPDATE voice_imports SET status=?,payload=? WHERE id=?').run(job.status, JSON.stringify(job), job.id); }
  complete(id: string, value: { transcript: string; durationSeconds: number; hash: string }) {
    const job = this.get(id); if (!job || job.status !== 'running') throw new VoiceImportError('导入任务状态不正确');
    if (!value.transcript.trim() || Array.from(value.transcript).length > 1000 || !/^[a-f0-9]{64}$/.test(value.hash) || !Number.isFinite(value.durationSeconds) || value.durationSeconds < 3 || value.durationSeconds > 30) throw new VoiceImportError('识别结果不正确');
    this.update({ ...job, ...value, status: 'succeeded' });
  }
  fail(id: string, error: string) { const job = this.get(id); if (job?.status === 'running') this.update({ ...job, status: 'failed', error: error.slice(0, 700) }); }
  recoverInterrupted() { for (const row of this.projects.db.prepare("SELECT payload FROM voice_imports WHERE status='running'").all()) this.fail(decode(row).id, '上次导入进程中断，请重新导入；原音色没有改变'); }
  save(id: string, name: string, referenceText: string) {
    const db = this.projects.db; const voices = new VoiceStore(this.projects); db.exec('BEGIN IMMEDIATE');
    try {
      const job = this.get(id); if (!job) throw new NotFoundError('导入记录不存在');
      if (job.voiceId) { const previous = voices.get(job.voiceId); if (!previous) throw new VoiceImportError('已保存的音色资料缺失'); db.exec('COMMIT'); return previous; }
      if (job.status !== 'succeeded' || !job.hash || !job.durationSeconds) throw new VoiceImportError('提取和识别尚未完成，不能保存音色');
      if (typeof name !== 'string' || !name.trim() || Array.from(name).length > 40 || typeof referenceText !== 'string' || !referenceText.trim() || Array.from(referenceText).length > 1000) throw new VoiceImportError('请填写名称（40 字内）和准确原文（1000 字内）');
      const voice = voices.create({ name, referenceText, path: job.audioPath, hash: job.hash, durationSeconds: job.durationSeconds });
      this.update({ ...job, voiceId: voice.id, savedReferenceText: voice.referenceText, savedName: voice.name }); db.exec('COMMIT'); return voice;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}
