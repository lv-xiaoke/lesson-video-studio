'use client';
import { useEffect, useState } from 'react';
import type { VoiceProfile, VoicePreview } from '@/shared/voices';
import { request } from '../editor/api';
export function pauseOtherMedia(current: HTMLMediaElement) { document.querySelectorAll('audio,video').forEach(media => { if (media !== current) (media as HTMLMediaElement).pause(); }); }
export function VoiceCollection({ voices, ready, onRefresh }: { voices: VoiceProfile[]; ready: boolean; onRefresh: () => Promise<void> }) {
  const [text, setText] = useState('欢迎来到这节课，我们用一个简单的例子，一步一步理解这个知识点。');
  const [preview, setPreview] = useState<VoicePreview | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(''); const [name, setName] = useState(''); const [filter, setFilter] = useState('');
  useEffect(() => {
    if (!preview || !['queued', 'running'].includes(preview.status)) return;
    let active = true;
    const timer = setInterval(() => { request<VoicePreview>(`/api/voices/${preview.voiceId}/previews/${preview.id}`).then(job => { if (active) { setPreview(job); setError(''); } }).catch(e => { if (active) setError(e.message); }); }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [preview]);
  async function edit(id: string, body: object) {
    setBusy(true); setError('');
    try { await request(`/api/voices/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); await onRefresh(); setRenaming(''); }
    catch (e) { setError(e instanceof Error ? e.message : '音色修改失败'); } finally { setBusy(false); }
  }
  async function listen(id: string) {
    setBusy(true); setError('');
    try { setPreview(await request<VoicePreview>(`/api/voices/${id}/previews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })); }
    catch (e) { setError(e instanceof Error ? e.message : '试听失败'); } finally { setBusy(false); }
  }
  const pending = !!preview && ['queued', 'running'].includes(preview.status);
  const visible = voices.filter(v => v.name.toLowerCase().includes(filter.toLowerCase()));
  return <section className="voice-collection" aria-labelledby="collection-title">
    <div className="voice-section-title"><span>{voices.length}</span><h2 id="collection-title">我的音色</h2><button className="voice-refresh" onClick={() => void onRefresh().catch(e => setError(e.message))}>刷新</button></div>
    <p className="voice-help">保存后，在课程「声音」中选择使用。停用不会删除原录音或已生成配音。</p>
    <label htmlFor="voice-filter">查找音色<input id="voice-filter" type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="输入音色名称" /></label>
    <label htmlFor="voice-sample-text">合成试听文字<textarea id="voice-sample-text" rows={3} value={text} maxLength={200} onChange={e => setText(e.target.value)} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    {!visible.length && <p className="voice-empty">{voices.length ? '没有匹配的音色。' : '还没有音色。从左侧上传视频或录音开始。'}</p>}
    <ul className="voice-profiles">{visible.map(voice => <li key={voice.id}>
      <div className="profile-heading"><h3>{voice.name}</h3><small>{voice.durationSeconds.toFixed(1)} 秒参考录音</small></div>
      <audio controls preload="none" src={`/api/voices/${voice.id}/audio`} aria-label={`${voice.name}参考录音`} onPlay={e => pauseOtherMedia(e.currentTarget)} />
      <details><summary>查看参考原文</summary><p className="reference-copy">{voice.referenceText}</p></details>
      {renaming === voice.id ? <div className="profile-rename"><label>新音色名称<input value={name} maxLength={40} onChange={e => setName(e.target.value)} /></label><button disabled={busy || !name.trim()} onClick={() => void edit(voice.id, { name })}>保存名称</button><button onClick={() => setRenaming('')}>取消</button></div>
        : <div className="profile-actions"><button disabled={busy || pending || !ready || !text.trim()} onClick={() => void listen(voice.id)}>合成试听</button><button disabled={busy} onClick={() => { setRenaming(voice.id); setName(voice.name); }}>改名</button><button disabled={busy} onClick={() => void edit(voice.id, { archived: true })}>停用</button></div>}
    </li>)}</ul>
    {pending && <p role="status">{preview.status === 'queued' ? '试听已排队，等待后台生成…' : '正在生成试听…'}</p>}
    {preview?.status === 'failed' && <p role="alert" className="error">{preview.error}</p>}
    {preview?.status === 'succeeded' && <div className="voice-notice"><b>最新合成试听</b><audio controls src={`/api/voices/${preview.voiceId}/previews/${preview.id}?audio=1`} aria-label="最新合成试听" onPlay={e => pauseOtherMedia(e.currentTarget)} /></div>}
  </section>;
}
