'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { VoiceProfile } from '@/shared/voices';
import type { SpeechConfig } from '@/shared/narration';
import type { VoiceImport, AsrConfig } from '@/shared/voice-import';
import { voiceImportEditorValues } from '@/shared/voice-import';
import { request } from '../editor/api';
import { MediaImport } from './MediaImport';
import { VoiceCollection, pauseOtherMedia } from './VoiceCollection';
import './voices.css';
const statusText = { queued: '等待后台处理', running: '提取与识别中', succeeded: '待检查并保存', failed: '导入失败' };
export function VoiceManager() {
  const [voices, setVoices] = useState<VoiceProfile[]>([]); const [imports, setImports] = useState<VoiceImport[]>([]);
  const [selectedId, setSelectedId] = useState(''); const [edits, setEdits] = useState<Record<string, { name: string; text: string }>>({});
  const [config, setConfig] = useState<AsrConfig | null>(null); const [ttsReady, setTtsReady] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [savingId, setSavingId] = useState('');
  const refreshVoices = useCallback(async () => { setVoices(await request<VoiceProfile[]>('/api/voices')); }, []);
  useEffect(() => {
    let active = true;
    const poll = async () => { try { const jobs = await request<VoiceImport[]>('/api/voice-imports'); if (active) { setImports(jobs); setSelectedId(current => current || jobs[0]?.id || ''); } } catch { if (active) setError('暂时无法读取导入进度，将自动重试'); } };
    const settings = async () => { try { const [asr, tts] = await Promise.all([request<AsrConfig>('/api/voice-imports/config'), request<SpeechConfig>('/api/tts/config?provider=zipvoice')]); if (active) { setConfig(asr); setTtsReady(tts.configured); } } catch { if (active) setConfig({ provider: 'sensevoice', configured: false, reason: '无法读取本地服务状态，请检查服务是否启动' }); } };
    void poll(); void settings(); void refreshVoices().catch(e => { if (active) setError(e.message); });
    const timer = setInterval(poll, 2000); const configTimer = setInterval(settings, 10000);
    return () => { active = false; clearInterval(timer); clearInterval(configTimer); };
  }, [refreshVoices]);
  const selected = imports.find(job => job.id === selectedId);
  const edit = selected ? voiceImportEditorValues(selected, edits[selected.id]) : { name: '', text: '' };
  useEffect(() => {
    const dirty = imports.some(job => !job.voiceId && edits[job.id] && (edits[job.id].text !== (job.transcript || '') || edits[job.id].name !== job.filename.replace(/\.[^.]+$/, '').slice(0, 40)));
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [edits, imports]);
  function setEdit(value: Partial<{ name: string; text: string }>) { if (selected) setEdits(current => ({ ...current, [selected.id]: { ...edit, ...value } })); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return; const id = selected.id;
    setSavingId(id); setError(''); setMessage('');
    try {
      const voice = await request<VoiceProfile>(`/api/voice-imports/${id}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: edit.name, referenceText: edit.text }) });
      setImports(current => current.map(job => job.id === id ? { ...job, voiceId: voice.id, savedReferenceText: voice.referenceText, savedName: voice.name } : job));
      await refreshVoices(); setMessage(`「${voice.name}」已保存到音色库。返回课程即可选择。`);
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); } finally { setSavingId(''); }
  }
  return <div className="voices-page">
    <a className="voice-skip" href="#voice-workspace">跳到音色管理</a>
    <header className="home-header"><a className="brand" href="/">知帧<span>音色库</span></a><nav aria-label="工作台导航"><a href="/">返回项目</a></nav></header>
    <main id="voice-workspace" className="voice-main">
      <div className="voice-page-heading"><div><h1>把熟悉的声音，留给下一节课。</h1><p>从视频或录音提取参考声音，自动识别原文，检查后保存。</p></div><span className={'voice-service-state ' + (config?.configured ? 'ready' : '')}>{config?.configured ? '本地识别已就绪' : '本地识别未就绪'}</span></div>
      {(error || message) && <p className={error ? 'voice-notice error' : 'voice-notice'} role={error ? 'alert' : 'status'}>{error || message}</p>}
      <div className="voice-workspace">
        <div className="voice-import-column"><MediaImport config={config} onCreated={job => { setImports(current => [job, ...current.filter(j => j.id !== job.id)]); setSelectedId(job.id); setMessage(''); }} onVoiceSaved={refreshVoices} />
          <section className="import-history" aria-labelledby="history-title"><h2 id="history-title">最近导入</h2><p className="voice-help">关闭页面后仍在后台处理，回来可继续检查。</p>{!imports.length ? <p className="voice-empty">还没有导入记录。</p> : <ul>{imports.map(job => <li key={job.id}><button aria-pressed={selectedId === job.id} onClick={() => { setSelectedId(job.id); setError(''); }}><b>{job.filename}</b><span>{job.voiceId ? '已保存音色' : statusText[job.status]} · {job.start.toFixed(1)}s 起 / {job.duration.toFixed(1)}s</span></button></li>)}</ul>}</section>
        </div>
        <section className="voice-review" aria-labelledby="review-title"><div className="voice-section-title"><span>2</span><h2 id="review-title">检查声音与原文</h2></div>
          {!selected ? <div className="voice-empty review-empty"><b>先从左侧添加一段声音</b><p>系统会提取所选片段并识别文字，再由你确认保存。</p></div> : <>
            <p className="voice-source-name">{selected.filename}</p>
            {['queued', 'running'].includes(selected.status) && <div className="voice-processing" role="status"><b>{statusText[selected.status]}…</b><p>后台会依次提取声音和识别文字。首次识别可能稍慢，请勿重复上传。</p></div>}
            {selected.status === 'failed' && <div className="voice-notice error" role="alert">{selected.error}<p>请调整片段或文件后，从左侧重新导入。原有音色不受影响。</p></div>}
            {selected.status === 'succeeded' && <><label>提取的参考声音<audio controls preload="metadata" src={`/api/voice-imports/${selected.id}/audio`} aria-label="提取的参考声音" onPlay={e => pauseOtherMedia(e.currentTarget)} /><small>实际时长 {selected.durationSeconds?.toFixed(2)} 秒，24 kHz 单声道。</small></label>
              <form onSubmit={event => void save(event)}><fieldset disabled={!!selected.voiceId || savingId === selected.id}>
                <label htmlFor="import-voice-name">保存为音色名称<input id="import-voice-name" maxLength={40} required value={edit.name} onChange={e => setEdit({ name: e.target.value })} /></label>
                <label htmlFor="recognized-text">自动识别的原文<textarea id="recognized-text" rows={12} maxLength={1000} required value={edit.text} onChange={e => setEdit({ text: e.target.value })} /><small>请边听边检查，修正错字、漏字。准确原文会影响音色生成效果。</small></label>
                <button className="primary" type="submit" disabled={!edit.name.trim() || !edit.text.trim()}>{savingId === selected.id ? '正在保存…' : '确认原文并保存音色'}</button>
              </fieldset></form>{selected.voiceId && <p className="voice-notice" role="status">此片段已保存为音色，可在右侧试听，或返回课程使用。重复操作不会生成重复音色。</p>}
            </>}
          </>}
        </section>
        <VoiceCollection voices={voices} ready={ttsReady} onRefresh={refreshVoices} />
      </div>
    </main>
  </div>;
}
