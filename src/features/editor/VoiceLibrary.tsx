'use client';
import { useEffect, useState } from 'react';
import type { VoiceProfile, VoicePreview } from '@/shared/voices';
import { request } from './api';

export function VoiceLibrary({ voices, onRefresh, onSelect, onListen, ready }: { voices: VoiceProfile[]; onRefresh: () => Promise<void>; onSelect: (id: string) => void; onListen: () => void; ready: boolean }) {
  const [name, setName] = useState(''); const [referenceText, setReferenceText] = useState('');
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [text, setText] = useState('欢迎来到这节课，我们用一个简单的例子，一步一步理解这个知识点。');
  const [preview, setPreview] = useState<VoicePreview | null>(null);
  const [renaming, setRenaming] = useState(''); const [newName, setNewName] = useState('');
  useEffect(() => {
    if (!preview || !['queued', 'running'].includes(preview.status)) return;
    let active = true;
    const timer = setInterval(() => {
      request<VoicePreview>(`/api/voices/${preview.voiceId}/previews/${preview.id}`).then(job => { if (active) { setPreview(job); setError(''); } }).catch(e => { if (active) setError(e.message); });
    }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [preview]);
  const pending = !!preview && ['queued', 'running'].includes(preview.status);
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file) return;
    const formElement = event.currentTarget;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = new FormData(); data.set('audio', file); data.set('name', name); data.set('referenceText', referenceText);
      const voice = await request<VoiceProfile>('/api/voices', { method: 'POST', body: data });
      await onRefresh(); setName(''); setReferenceText(''); setFile(null); formElement.reset();
      setMessage(`「${voice.name}」已保存。请在音色列表中选择，再应用到全部小节。`);
    } catch (e) { setError(e instanceof Error ? e.message : '上传失败'); }
    finally { setBusy(false); }
  }
  async function edit(id: string, body: object) {
    setBusy(true); setError('');
    try { await request(`/api/voices/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); await onRefresh(); setRenaming(''); }
    catch (e) { setError(e instanceof Error ? e.message : '音色修改失败'); }
    finally { setBusy(false); }
  }
  async function listen(id: string) {
    setBusy(true); setError(''); onListen();
    try { setPreview(await request<VoicePreview>(`/api/voices/${id}/previews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })); }
    catch (e) { setError(e instanceof Error ? e.message : '试听失败'); }
    finally { setBusy(false); }
  }
  return <details className="voice-library">
    <summary>管理我的音色 <span>{voices.length} 个</span></summary>
    <p className="speech-help">音色保存在这台电脑上，上传一次，以后直接选择。录音与对应文字要完全一致。</p>
    <form onSubmit={event => void upload(event)}>
      <fieldset disabled={busy}>
        <legend>添加音色</legend>
        <label htmlFor="new-voice-name">音色名称<input id="new-voice-name" value={name} required maxLength={40} onChange={e => setName(e.target.value)} placeholder="例如：我的教学声音" /></label>
        <label htmlFor="new-voice-file">参考录音<input id="new-voice-file" type="file" accept=".wav,.mp3" required onChange={e => { const value = e.target.files?.[0] || null; if (value && value.size > 10 * 1024 * 1024) { setError('文件超过 10 MB，请选择较短录音'); setFile(null); e.target.value = ''; } else { setFile(value); setError(''); } }} /><small>WAV / MP3，3～30 秒，最多 10 MB。建议 10～20 秒清晰单人讲话。</small></label>
        <label htmlFor="new-voice-text">录音中说出的原文<textarea id="new-voice-text" value={referenceText} onChange={e => setReferenceText(e.target.value)} rows={4} required maxLength={1000} placeholder="逐字填写录音内容，第一版需要手动输入。" /></label>
        <button disabled={!file || !name.trim() || !referenceText.trim()} type="submit">{busy ? '正在保存…' : '保存音色'}</button>
      </fieldset>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status" className="speech-help">{message}</p>}
    <label htmlFor="voice-preview-text">试听文字<textarea id="voice-preview-text" rows={3} maxLength={200} value={text} onChange={e => setText(e.target.value)} /></label>
    {!voices.length && <p className="speech-help">还没有本地音色。先上传一段你有权使用的录音。</p>}
    <ul className="voice-list">{voices.map(voice => <li key={voice.id}>
      <div className="voice-list-heading"><b>{voice.name}</b><small>{voice.durationSeconds.toFixed(1)} 秒参考录音</small></div>
      <audio controls preload="none" aria-label={`${voice.name}的参考录音`} src={`/api/voices/${voice.id}/audio`} onPlay={onListen} />
      {renaming === voice.id ? <div className="voice-rename"><label>新名称<input maxLength={40} value={newName} onChange={e => setNewName(e.target.value)} /></label><button disabled={busy || !newName.trim()} onClick={() => void edit(voice.id, { name: newName })}>保存名称</button><button onClick={() => setRenaming('')}>取消</button></div>
        : <div className="voice-actions"><button disabled={busy} onClick={() => { onSelect(voice.id); setMessage(`已选择「${voice.name}」`); }}>选择</button><button disabled={busy || pending || !ready || !text.trim()} onClick={() => void listen(voice.id)}>合成试听</button><button disabled={busy} onClick={() => { setRenaming(voice.id); setNewName(voice.name); }}>改名</button><button disabled={busy} onClick={() => void edit(voice.id, { archived: true })}>停用</button></div>}
    </li>)}</ul>
    {pending && <p role="status">{preview.status === 'queued' ? '试听已排队，等待后台生成…' : '正在本地生成试听…'}</p>}
    {preview?.status === 'failed' && <p role="alert" className="error">{preview.error}</p>}
    {preview?.status === 'succeeded' && <div className="audio-preview"><b>最新合成试听</b><audio controls aria-label="最新音色合成试听" src={`/api/voices/${preview.voiceId}/previews/${preview.id}?audio=1`} onPlay={onListen} /></div>}
  </details>;
}
