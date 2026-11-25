import { getStore } from '../src/server/db/index.ts';
const store = getStore(); let active = 0;
for (const table of ['jobs', 'speech_jobs', 'ai_jobs', 'voice_previews', 'voice_imports']) {
  if (!store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
  const count = Number(store.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE status IN ('queued','running')`).get().count);
  active += count; console.log(`${table}: ${count}`);
}
store.close(); if (active) process.exitCode = 1;
