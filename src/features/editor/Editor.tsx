'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Player, type PlayerRef } from '@remotion/player';
import { LessonVideo } from '@/video/LessonVideo';
import { buildTimeline, totalFrames } from '@/video/timeline';
import type { Lesson, Project } from '@/shared/lesson';
import type { Scene } from '@/shared/scene';
import type { Job } from '@/shared/job';
import { narrationSignature, estimateSpeechCost } from '@/shared/narration';
import type { PreviewAudio, SpeechConfig, SpeechState } from '@/shared/narration';
import { NarrationPanel } from './NarrationPanel';

const labels = { title: '开场标题', array: '数组演示', summary: '知识总结' };
const jobLabels = { queued: '等待后台制作', running: '正在制作', succeeded: '制作完成', failed: '制作失败' };
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init); const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作失败');
  return data as T;
}
export function Editor({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [draft, setDraft] = useState<Lesson | null>(null);
  const [selected, setSelected] = useState(0);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [speech, setSpeech] = useState<SpeechState>({ assets: [], jobs: [] });
  const [speechConfig, setSpeechConfig] = useState<SpeechConfig | null>(null);
  const [speechError, setSpeechError] = useState('');
  const [useAudio, setUseAudio] = useState(true);
  const player = useRef<PlayerRef>(null);
  const refreshSpeech = useCallback(async () => {
    const state = await request<SpeechState>(`/api/projects/${projectId}/narrations`);
    setSpeech(state); setSpeechError('');
  }, [projectId]);
  useEffect(() => {
    request<SpeechConfig>('/api/tts/config').then(setSpeechConfig).catch(() => setSpeechError('无法读取配音服务配置，请稍后刷新'));
    let active = true;
    const poll = async () => { try { const state = await request<SpeechState>(`/api/projects/${projectId}/narrations`); if (active) { setSpeech(state); setSpeechError(''); } } catch { if (active) setSpeechError('暂时无法获取配音状态，将自动重试'); } };
    void poll(); const timer = setInterval(poll, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [projectId]);
  const allAudio: PreviewAudio = {};
  if (draft) for (const scene of draft.scenes) {
    const asset = speech.assets.find(a => a.sceneId === scene.id && a.signature === narrationSignature(scene, speechConfig?.provider) && a.model === speechConfig?.model);
    if (asset) allAudio[scene.id] = { src: `/api/projects/${projectId}/narrations/${asset.id}`, durationSeconds: asset.durationSeconds };
  }
  const audio = useAudio ? allAudio : {};
  const dirty = !!project && !!draft && JSON.stringify(project.lesson) !== JSON.stringify(draft);
  useEffect(() => {
    let active = true;
    request<Project>(`/api/projects/${projectId}`).then(p => { if (active) { setProject(p); setDraft(p.lesson); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [projectId]);
  useEffect(() => {
    let active = true;
    async function poll() { try { const result = await request<Job[]>(`/api/projects/${projectId}/exports`); if (active) setJobs(result); } catch { /* Editing remains available; retry on next poll. */ } }
    void poll(); const timer = setInterval(poll, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [projectId]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function saveAndMaybeExport(exportVideo: boolean) {
    if (!draft || !project) return;
    setBusy(true); setError(''); setMessage('');
    try {
      let saved = project;
      if (dirty) {
        saved = await request<Project>(`/api/projects/${projectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson: draft, version: project.version }) });
        setProject(saved); setDraft(saved.lesson);
      }
      if (exportVideo) {
        const job = await request<Job>(`/api/projects/${projectId}/exports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: saved.version, includeAudio: useAudio }) });
        setJobs(current => [job, ...current.filter(j => j.id !== job.id)]);
        setMessage('已加入制作队列。请保持后台制作程序运行；关闭网页不会取消任务。');
      } else setMessage('项目已保存。');
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(false); }
  }
  async function generateNarration(ids: string[], force = false) {
    if (!draft || !project) return;
    setBusy(true); setError(''); setMessage('');
    try {
      let saved = project;
      if (dirty) {
        saved = await request<Project>(`/api/projects/${projectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson: draft, version: project.version }) });
        setProject(saved); setDraft(saved.lesson);
      }
      const result = await request<{ jobs: unknown[]; reused: unknown[] }>(`/api/projects/${projectId}/narrations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: saved.version, sceneIds: ids, force }) });
      await refreshSpeech(); setUseAudio(true);
      setMessage(result.jobs.length ? '配音任务已提交，完成后可试听。请保持后台制作程序运行。' : '已复用匹配的配音，没有再次调用合成服务。');
    } catch (e) { setError(e instanceof Error ? e.message : '配音提交失败'); }
    finally { setBusy(false); }
  }
  function patchScene(patch: Partial<Scene>) {
    setDraft(current => current ? { ...current, scenes: current.scenes.map((s, i) => i === selected ? { ...s, ...patch } : s) } : current);
  }
  function select(index: number) {
    setSelected(index); if (draft) player.current?.seekTo(buildTimeline(draft.scenes, 30, audio)[index].from + 20);
  }
  function move(direction: number) {
    if (!draft) return; const target = selected + direction;
    if (target < 0 || target >= draft.scenes.length) return;
    const scenes = [...draft.scenes]; [scenes[selected], scenes[target]] = [scenes[target], scenes[selected]];
    setDraft({ ...draft, scenes }); setSelected(target); player.current?.pause();
    player.current?.seekTo(buildTimeline(scenes, 30, audio)[target].from + 20);
  }
  if (!draft || !project) return <main className="loading-page"><Link href="/">返回项目列表</Link><p role={error ? 'alert' : undefined}>{error || '正在打开工作台…'}</p></main>;
  const scene = draft.scenes[selected];
  const timeline = buildTimeline(draft.scenes, 30, audio);
  const missing = draft.scenes.filter(s => !allAudio[s.id]).map(s => s.id);
  const pendingSpeech = speech.jobs.some(j => j.status === 'queued' || j.status === 'running');
  const missingText = draft.scenes.filter(s => missing.includes(s.id)).map(s => s.narration).join('');
  const batchEstimate = estimateSpeechCost(missingText, speechConfig?.pricePer10k ?? null);
  return <div className="editor-shell">
    <header className="editor-header"><div className="editor-brand"><Link href="/" onClick={e => { if (dirty && !window.confirm('草稿尚未保存，确定返回吗？')) e.preventDefault(); }}>知帧</Link><span className="divider" /><span className="project-name">{project.lesson.title}</span></div><div className="header-actions"><span className={dirty ? 'unsaved' : 'saved'}>{dirty ? '有未保存修改' : `已保存 · 版本 ${project.version}`}</span><button disabled={busy || !dirty} onClick={() => void saveAndMaybeExport(false)}>保存项目</button><button className="primary" disabled={busy || jobs.some(j => j.status === 'queued' || j.status === 'running')} onClick={() => void saveAndMaybeExport(true)}>{busy ? '正在处理…' : useAudio ? '导出带配音视频' : '导出无声视频'}</button></div></header>
    <div className="editor-body"><aside className="scene-sidebar"><div className="sidebar-title"><h2>教学小节</h2><span>{draft.scenes.length} 节</span></div><p className="sidebar-help">点击小节，调整画面与讲解。</p><div className="scene-list">{draft.scenes.map((s, i) => <button className={`scene-item ${selected === i ? 'active' : ''}`} onClick={() => select(i)} key={s.id} disabled={busy}><span className="scene-number">{String(i + 1).padStart(2, '0')}</span><span><b>{s.title || '未命名小节'}</b><small>{labels[s.kind]} · {(timeline[i].durationInFrames / 30).toFixed(1)} 秒</small></span></button>)}</div><div className="reorder"><button disabled={busy || selected === 0} onClick={() => move(-1)}>上移</button><button disabled={busy || selected === draft.scenes.length - 1} onClick={() => move(1)}>下移</button></div><div className="sidebar-bottom"><span className="pill">制作说明</span><p>先编辑并确认讲解，再生成小节配音。修改文字、音色或语速后，只需更新受影响的小节。</p></div></aside>
    <main className="preview-main"><div className="preview-heading"><div><span className="eyebrow">画面预览</span><h1>让每个知识点，都讲得清楚。</h1></div><span className="format">16:9 · 1080P · 30 FPS</span></div>
      <div className="player-wrap"><Player ref={player} component={LessonVideo} inputProps={{ lesson: draft, audio }} compositionWidth={1920} compositionHeight={1080} durationInFrames={totalFrames(draft.scenes, 30, audio)} fps={30} controls style={{ width: '100%', aspectRatio: '16 / 9' }} acknowledgeRemotionLicense /></div>
      <div className="preview-caption"><span>画面和字幕实时更新</span><span>总时长 {(totalFrames(draft.scenes, 30, audio) / 30).toFixed(1)} 秒 · {useAudio ? `${Object.keys(allAudio).length}/${draft.scenes.length} 节配音就绪` : '无配音预览'}</span></div>
      <div className="timeline-heading"><h2>内容顺序</h2><span>按小节组织，保留每一次修改</span></div><div className="visual-timeline">{timeline.map((entry, i) => <button key={entry.scene.id} className={selected === i ? 'active' : ''} style={{ flex: entry.durationInFrames }} onClick={() => select(i)}><span>{String(i + 1).padStart(2, '0')} / {labels[entry.scene.kind]}</span><b>{entry.scene.title}</b><small>{(entry.from / 30).toFixed(0)}s — {((entry.from + entry.durationInFrames) / 30).toFixed(0)}s</small></button>)}</div>
      <section className="speech-overview"><div><h2>讲解与声音</h2><p>{Object.keys(allAudio).length} / {draft.scenes.length} 节配音已就绪；缺失 {Array.from(missingText).length} 字符{speechConfig?.provider === 'tencent' ? '，使用腾讯云精品音色资源包' : batchEstimate === null ? '，未配置参考单价' : `，参考费用约 ¥${batchEstimate.toFixed(4)}`}。</p><label><input type="checkbox" checked={useAudio} onChange={e => { player.current?.pause(); setUseAudio(e.target.checked); }} />预览与导出使用配音</label></div><button disabled={busy || pendingSpeech || !speechConfig?.configured || missing.length === 0} onClick={() => void generateNarration(missing)}>生成缺失配音（{missing.length} 节）</button></section>
      {(error || message) && <div className={error ? 'notice error' : 'notice'} role={error ? 'alert' : 'status'}>{error || message}{error.includes('已被修改') && <button onClick={() => { if (window.confirm('重新载入会放弃本页草稿，确定吗？')) window.location.reload(); }}>重新载入</button>}</div>}
      <section className="exports"><div className="section-heading"><h2>视频导出</h2><span>结果使用提交时保存的版本</span></div>{jobs.length === 0 ? <p className="muted">调整完成后，点击右上角“导出视频”。</p> : jobs.slice(0, 4).map(job => <div className="job-row" key={job.id}><div><b>版本 {job.version}</b><span className="job-status">{jobLabels[job.status]}{job.status === 'running' ? ` · ${Math.round(job.progress * 100)}%` : ''}</span>{job.status === 'queued' && <small>如果一直等待，请检查后台制作程序是否已启动。</small>}{job.error && <small className="error">{job.error}</small>}</div>{job.status === 'succeeded' ? <a className="download" href={`/api/exports/${job.id}/download`}>下载 MP4</a> : <span className="muted">{new Date(job.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}</div>)}</section>
    </main>
    <aside className="inspector"><div className="inspector-heading"><span className="eyebrow">编辑第 {selected + 1} 小节</span><h2>{labels[scene.kind]}</h2></div><fieldset disabled={busy}>
      <label htmlFor="lesson-title">视频标题<input id="lesson-title" value={draft.title} maxLength={100} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <div className="field-divider" /><label htmlFor="scene-title">小节标题<input id="scene-title" value={scene.title} maxLength={60} onChange={e => patchScene({ title: e.target.value })} /></label>
      <label htmlFor="scene-kind">画面类型<select id="scene-kind" value={scene.kind} onChange={e => patchScene({ kind: e.target.value as Scene['kind'] })}>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label htmlFor="scene-content">屏幕文字<textarea id="scene-content" rows={4} value={scene.content} maxLength={500} onChange={e => patchScene({ content: e.target.value })} /><small>每行一个要点，建议不超过 3 行。</small></label>
      <label htmlFor="scene-narration">讲解稿<textarea id="scene-narration" rows={5} value={scene.narration} maxLength={500} onChange={e => patchScene({ narration: e.target.value })} /><small>先确认讲解，再生成配音。修改后旧配音会标记为需要更新。</small></label>
      <label htmlFor="scene-duration">{audio[scene.id] ? '画面时长（按配音自动匹配）' : '画面时长（秒）'}<input id="scene-duration" type="number" min={3} max={60} step={0.5} disabled={!!audio[scene.id]} value={audio[scene.id] ? timeline[selected].durationInFrames / 30 : scene.durationSeconds} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) patchScene({ durationSeconds: Math.max(3, Math.min(60, n)) }); }} /></label>
    </fieldset><NarrationPanel scene={scene} projectId={projectId} assets={speech.assets} jobs={speech.jobs} config={speechConfig} busy={busy} error={speechError} onChange={patchScene} onGenerate={force => void generateNarration([scene.id], force)} onListen={() => player.current?.pause()} /><div className="inspector-note">已就绪的配音按实际音频时长安排画面，并保留结尾停顿。带配音导出需要每节的配音均匹配当前讲解。</div></aside></div>
  </div>;
}
