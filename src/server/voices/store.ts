import { randomUUID } from 'node:crypto';
import { ProjectStore, NotFoundError } from '../db/store.ts';
import type { VoiceProfile, VoicePreview } from '../../shared/voices.ts';
const decode = <T>(row: Record<string, unknown>) => JSON.parse(String(row.payload)) as T;
const label = (value: unknown, max: number) => {
  if (typeof value !== 'string' || !value.trim() || Array.from(value).length > max) throw new Error(`请输入 1～${max} 字的文字`);
  return value.trim();
};
export class VoiceStore {
  projects: ProjectStore;
  constructor(projects: ProjectStore) {
    this.projects = projects;
    projects.db.exec(`CREATE TABLE IF NOT EXISTS voice_profiles(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS voice_previews(id TEXT PRIMARY KEY, voice_id TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL);`);
  }
  list(includeArchived = false) { return this.projects.db.prepare('SELECT payload FROM voice_profiles ORDER BY rowid DESC').all().map(r => decode<VoiceProfile>(r)).filter(v => includeArchived || !v.archivedAt); }
  get(id: string) { const row = this.projects.db.prepare('SELECT payload FROM voice_profiles WHERE id=?').get(id); return row ? decode<VoiceProfile>(row) : undefined; }
  active(id: string) { const voice = this.get(id); if (!voice) throw new NotFoundError('本地音色不存在，请先上传并选择音色'); if (voice.archivedAt) throw new Error('本地音色已停用，请选择其他音色'); return voice; }
  create(input: { id?: string; name: string; path: string; referenceText: string; durationSeconds: number; hash: string }) {
    if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 3 || input.durationSeconds > 30 || !/^[a-f0-9]{64}$/.test(input.hash)) throw new Error('录音资料不正确');
    const voice: VoiceProfile = { id: input.id || randomUUID(), name: label(input.name, 40), referenceText: label(input.referenceText, 1000), path: input.path, hash: input.hash, durationSeconds: input.durationSeconds, createdAt: new Date().toISOString(), archivedAt: null };
    this.projects.db.prepare('INSERT INTO voice_profiles VALUES(?,?)').run(voice.id, JSON.stringify(voice)); return voice;
  }
  rename(id: string, name: string) { const voice = this.active(id); voice.name = label(name, 40); this.save(voice); return voice; }
  archive(id: string) { const voice = this.active(id); voice.archivedAt = new Date().toISOString(); this.save(voice); return voice; }
  private save(voice: VoiceProfile) { this.projects.db.prepare('UPDATE voice_profiles SET payload=? WHERE id=?').run(JSON.stringify(voice), voice.id); }
  preview(voiceId: string, text: string) {
    this.active(voiceId);
    const pending = this.projects.db.prepare("SELECT id FROM voice_previews WHERE status IN ('queued','running')").all();
    if (pending.length >= 10) throw new Error('试听任务较多，请等待已有试听完成');
    const job: VoicePreview = { id: randomUUID(), voiceId, text: label(text, 200), status: 'queued', path: null, durationSeconds: null, error: null, createdAt: new Date().toISOString() };
    this.projects.db.prepare('INSERT INTO voice_previews VALUES(?,?,?,?)').run(job.id, voiceId, job.status, JSON.stringify(job)); return job;
  }
  getPreview(voiceId: string, id: string) { const row = this.projects.db.prepare('SELECT payload FROM voice_previews WHERE id=? AND voice_id=?').get(id, voiceId); return row ? decode<VoicePreview>(row) : undefined; }
  claim() {
    const db = this.projects.db; db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare("SELECT payload FROM voice_previews WHERE status='queued' ORDER BY rowid LIMIT 1").get();
      if (!row) { db.exec('COMMIT'); return; }
      const job = decode<VoicePreview>(row); job.status = 'running'; this.updatePreview(job); db.exec('COMMIT'); return job;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  updatePreview(job: VoicePreview) { this.projects.db.prepare('UPDATE voice_previews SET status=?,payload=? WHERE id=?').run(job.status, JSON.stringify(job), job.id); }
  recoverInterrupted() { for (const row of this.projects.db.prepare("SELECT payload FROM voice_previews WHERE status='running'").all()) this.updatePreview({ ...decode<VoicePreview>(row), status: 'failed', error: '上次本地试听中断，请手动重试' }); }
}
