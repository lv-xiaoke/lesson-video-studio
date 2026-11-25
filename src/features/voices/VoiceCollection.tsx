'use client';
import { useEffect, useState } from 'react';
import type { VoiceProfile, VoicePreview } from '@/shared/voices';
import { request } from '../editor/api';
import { VoiceIcon, VoiceWave } from './VoiceIcon';
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
    <div className="collection-heading"><div><div className="collection-title"><h2 id="collection-title">我的音色</h2><span>{voices.length} 个音色</span></div><p>播放参考录音，或用新文案合成试听。</p></div><div className="collection-tools"><label htmlFor="voice-filter" className="voice-search"><span className="voice-sr-only">查找音色</span><VoiceIcon name="search" /><input id="voice-filter" type="search" name="voice-search" autoComplete="off" value={filter} onChange={e => setFilter(e.target.value)} placeholder="搜索音色名称…" /></label><button className="voice-refresh" aria-label="刷新音色列表" onClick={() => void onRefresh().catch(e => setError(e.message))}><VoiceIcon name="refresh" /><span>刷新</span></button></div></div>
    <details className="voice-sample-settings"><summary><VoiceIcon name="edit" />自定义合成试听文字<span>所有音色共用同一段文案，方便比较</span></summary><label htmlFor="voice-sample-text">合成试听文字<textarea id="voice-sample-text" rows={3} value={text} maxLength={200} onChange={e => setText(e.target.value)} /></label></details>
    {error && <p className="error" role="alert">{error}</p>}
    {!visible.length && <div className="collection-empty"><span><VoiceIcon name={voices.length ? 'search' : 'mic'} /></span><div><b>{voices.length ? '没有找到这个音色' : '先收藏你的第一段声音'}</b><p>{voices.length ? '试试其他名称，或清空搜索条件。' : '上传视频或录音，检查原文后，就能把声音留在这里。'}</p></div>{!voices.length && <a href="#voice-import-form"><VoiceIcon name="plus" />添加第一个音色</a>}</div>}
    <ul className="voice-profiles">{visible.map((voice, index) => <li className={`voice-profile tone-${index % 3}`} key={voice.id}>
      <div className="profile-heading"><span className="profile-avatar" aria-hidden="true">{Array.from(voice.name)[0]}</span><div><h3>{voice.name}</h3><small>已保存的参考声音</small></div><span className="profile-duration">{voice.durationSeconds.toFixed(1)} 秒</span></div>
      <div className="profile-wave"><VoiceWave compact /><span><VoiceIcon name="mic" />本地音色</span></div>
      <audio controls preload="none" src={`/api/voices/${voice.id}/audio`} aria-label={`${voice.name}参考录音`} onPlay={e => pauseOtherMedia(e.currentTarget)} />
      <details><summary>查看参考原文</summary><p className="reference-copy">{voice.referenceText}</p></details>
      {renaming === voice.id ? <div className="profile-rename"><label>新音色名称<input value={name} maxLength={40} onChange={e => setName(e.target.value)} /></label><button disabled={busy || !name.trim()} onClick={() => void edit(voice.id, { name })}>保存名称</button><button onClick={() => setRenaming('')}>取消</button></div>
        : <div className="profile-actions"><button className="profile-listen" disabled={busy || pending || !ready || !text.trim()} onClick={() => void listen(voice.id)}><VoiceIcon name="headphones" />合成试听</button><button disabled={busy} onClick={() => { setRenaming(voice.id); setName(voice.name); }}><VoiceIcon name="edit" />改名</button><button className="profile-archive" disabled={busy} onClick={() => void edit(voice.id, { archived: true })}><VoiceIcon name="archive" />停用</button></div>}
    </li>)}</ul>
    {pending && <p role="status">{preview.status === 'queued' ? '试听已排队，等待后台生成…' : '正在生成试听…'}</p>}
    {preview?.status === 'failed' && <p role="alert" className="error">{preview.error}</p>}
    {preview?.status === 'succeeded' && <div className="voice-notice"><b>最新合成试听</b><audio controls src={`/api/voices/${preview.voiceId}/previews/${preview.id}?audio=1`} aria-label="最新合成试听" onPlay={e => pauseOtherMedia(e.currentTarget)} /></div>}
  </section>;
}
