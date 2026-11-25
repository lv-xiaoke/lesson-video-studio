'use client';
import { useCallback, useEffect, useState } from 'react';
import type { VoiceProfile } from '@/shared/voices';
import type { SpeechConfig } from '@/shared/narration';
import type { VoiceImport, AsrConfig } from '@/shared/voice-import';
import { voiceImportEditorValues } from '@/shared/voice-import';
import { request } from '../editor/api';
import { MediaImport } from './MediaImport';
import { VoiceCollection, pauseOtherMedia } from './VoiceCollection';
import { VoiceIcon, VoiceWave } from './VoiceIcon';
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
    <header className="voice-header"><a className="voice-brand" href="/"><span className="voice-brand-symbol"><VoiceIcon name="mic" /></span><b>知帧</b><span className="voice-brand-divider" /><span>音色工作室</span></a><nav aria-label="工作台导航"><a href="/"><VoiceIcon name="arrow" />返回项目</a></nav></header>
    <main id="voice-workspace" className="voice-main">
      <div className="voice-page-heading"><div><h1>音色库</h1><p>管理你的讲解声音，让每一节课都有熟悉的声线。</p></div><div className="voice-page-actions"><span className={'voice-service-state ' + (config?.configured ? 'ready' : '')}><i aria-hidden="true" />{config ? config.configured ? '本地识别已就绪' : '本地识别未就绪' : '正在连接本地识别'}</span><a className="voice-add-link" href="#voice-import-form"><VoiceIcon name="plus" />添加音色</a></div></div>
      {(error || message) && <p className={error ? 'voice-notice error' : 'voice-notice'} role={error ? 'alert' : 'status'}>{error || message}</p>}
      <VoiceCollection voices={voices} ready={ttsReady} onRefresh={refreshVoices} />
      <div className="voice-workbench-heading"><div><h2>添加一段新的声音</h2><p>从视频或录音开始，提取、校对，再收进音色库。</p></div><span>上传素材 <i aria-hidden="true">／</i> 检查原文 <i aria-hidden="true">／</i> 保存音色</span></div>
      <div className="voice-workspace">
        <div className="voice-import-column"><MediaImport config={config} onCreated={job => { setImports(current => [job, ...current.filter(j => j.id !== job.id)]); setSelectedId(job.id); setMessage(''); }} onVoiceSaved={refreshVoices} />
          <section className="import-history" aria-labelledby="history-title"><div className="history-heading"><h2 id="history-title">最近导入</h2><span>{imports.length} 条记录</span></div><p className="voice-help">后台会继续处理，随时回来检查。</p>{!imports.length ? <p className="voice-empty history-empty"><VoiceIcon name="file" />导入记录会出现在这里</p> : <ul>{imports.map(job => <li key={job.id}><button aria-pressed={selectedId === job.id} onClick={() => { setSelectedId(job.id); setError(''); }}><span className="history-file-icon"><VoiceIcon name="file" /></span><span className="history-file-copy"><b>{job.filename}</b><span className="history-file-meta">从 {job.start.toFixed(1)} 秒起 · {job.duration.toFixed(1)} 秒</span></span><span className={`import-status ${job.voiceId ? 'is-saved' : 'is-' + job.status}`}>{job.voiceId ? '已保存' : statusText[job.status]}</span></button></li>)}</ul>}</section>
        </div>
        <section className="voice-review" aria-labelledby="review-title"><div className="voice-section-title"><span className="voice-step">02</span><div><h2 id="review-title">检查声音与原文</h2><p>听一遍，确认说出的每一个字。</p></div>{selected?.voiceId && <span className="review-saved-badge"><VoiceIcon name="check" />已保存</span>}</div>
          {!selected ? <div className="voice-empty review-empty"><div className="empty-sound-art"><VoiceWave /><span><VoiceIcon name="headphones" /></span></div><b>下一段好声音，从这里开始</b><p>在左侧上传素材后，提取的声音和识别原文<br />会显示在这里，等待你检查并保存。</p><span className="empty-sound-note">先听声音，再确认文字</span></div> : <>
            <div className="voice-source-name"><VoiceIcon name="file" /><span>{selected.filename}</span><small>{selected.durationSeconds ? `${selected.durationSeconds.toFixed(1)} 秒` : `${selected.duration.toFixed(1)} 秒片段`}</small></div>
            {['queued', 'running'].includes(selected.status) && <div className="voice-processing" role="status"><VoiceWave /><b>{statusText[selected.status]}…</b><p>正在整理这段声音，完成后即可检查原文。</p></div>}
            {selected.status === 'failed' && <div className="voice-notice error" role="alert">{selected.error}<p>请在「导入声音素材」中调整片段或文件后重新导入。原有音色不受影响。</p></div>}
            {selected.status === 'succeeded' && <><div className="review-audio"><div><VoiceIcon name="headphones" /><b>提取的参考声音</b><span>先试听，再校对</span></div><audio controls preload="metadata" src={`/api/voice-imports/${selected.id}/audio`} aria-label="提取的参考声音" onPlay={e => pauseOtherMedia(e.currentTarget)} /></div>
              <form onSubmit={event => void save(event)}><fieldset disabled={!!selected.voiceId || savingId === selected.id}>
                <label htmlFor="import-voice-name">保存为音色名称<input id="import-voice-name" maxLength={40} required value={edit.name} onChange={e => setEdit({ name: e.target.value })} /></label>
                <label htmlFor="recognized-text">自动识别的原文{!selected.voiceId && <span className="field-optional">可以直接修改</span>}<textarea id="recognized-text" rows={7} maxLength={1000} required value={edit.text} onChange={e => setEdit({ text: e.target.value })} /><small>对照音频修正错字、漏字，准确的原文有助于生成更好的声音。</small></label>
                <button className="primary" type="submit" disabled={!edit.name.trim() || !edit.text.trim()}><VoiceIcon name="check" />{savingId === selected.id ? '正在保存…' : '确认原文并保存音色'}</button>
              </fieldset></form>{selected.voiceId && <p className="voice-notice saved-notice" role="status"><VoiceIcon name="check" />音色已加入上方列表，可以试听，或返回课程使用。</p>}
            </>}
          </>}
        </section>
      </div>
    </main>
    <footer className="voice-footer"><span><VoiceIcon name="mic" />知帧音色工作室</span><p>参考声音与识别原文保存在本机</p></footer>
  </div>;
}
