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
import { SCENE_LABELS } from '@/shared/scene';
import { appendScene, duplicateScene, removeScene, changeSceneKind } from '@/shared/scene-actions';
import { SceneActions } from './SceneActions';
import { ComparisonFields } from './ComparisonFields';
import { AiPanel } from './AiPanel';
import { request } from './api';
import { sceneSpeechStatus, exportReadiness } from '@/shared/editor-workflow';
import { WorkflowNav, SpeechBadge, InspectorTabs, type Stage, type InspectorTab } from './Workflow';
import './editor.css';

const labels = SCENE_LABELS;
const jobLabels = { queued: '等待后台制作', running: '正在制作', succeeded: '制作完成', failed: '制作失败' };
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
  const [stage, setStage] = useState<Stage>('edit');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('text');
  const [configError, setConfigError] = useState('');
  const [exportError, setExportError] = useState('');
  const player = useRef<PlayerRef>(null);
  const refreshSpeech = useCallback(async () => {
    const state = await request<SpeechState>(`/api/projects/${projectId}/narrations`);
    setSpeech(state); setSpeechError('');
  }, [projectId]);
  useEffect(() => {
    request<SpeechConfig>('/api/tts/config').then(setSpeechConfig).catch(() => setConfigError('无法读取配音服务配置，请刷新页面后重试。'));
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
    async function poll() { try { const result = await request<Job[]>(`/api/projects/${projectId}/exports`); if (active) { setJobs(result); setExportError(''); } } catch { if (active) setExportError('暂时无法读取导出进度，将自动重新读取。'); } }
    void poll(); const timer = setInterval(poll, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [projectId]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function saveAndMaybeExport(exportVideo: boolean) {
    if (!draft || !project) return;
    if (exportVideo && !exportReadiness(draft, Object.keys(allAudio), useAudio).ready) { setStage('export'); setError('还有小节未完成配音，请先补齐，或选择导出无声视频。'); return; }
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
  async function prepareProject(): Promise<Project> {
    if (!project || !draft) throw new Error('项目尚未加载');
    player.current?.pause();
    if (!dirty) return project;
    setBusy(true);
    try {
      const saved = await request<Project>('/api/projects/' + projectId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson: draft, version: project.version }) });
      setProject(saved); setDraft(saved.lesson); return saved;
    } finally { setBusy(false); }
  }
  function applyAiProject(saved: Project) {
    player.current?.pause(); setProject(saved); setDraft(saved.lesson); setSelected(0);
    setStage('edit'); setInspectorTab('text'); setMessage('课程已更新。检查讲解和画面后，进入「生成配音」即可批量生成。');
    void refreshSpeech().catch(() => setSpeechError('课程已更新，配音状态读取失败，请刷新页面'));
  }
  function patchScene(patch: Partial<Scene>) {
    setDraft(current => current ? { ...current, scenes: current.scenes.map((s, i) => i === selected ? { ...s, ...patch } : s) } : current);
  }
  function manageScene(action: 'add' | 'copy' | 'remove') {
    if (!draft) return;
    if (action === 'remove' && !window.confirm('删除当前小节？原有音频文件仍会保留。')) return;
    try {
      player.current?.pause();
      const next = action === 'add' ? appendScene(draft) : action === 'copy' ? duplicateScene(draft, draft.scenes[selected].id) : removeScene(draft, draft.scenes[selected].id);
      setDraft(next);
      setSelected(action === 'add' ? next.scenes.length - 1 : action === 'copy' ? selected + 1 : Math.min(selected, next.scenes.length - 1));
      setError(''); setMessage('小节已调整，请保存项目。');
    } catch (error) { setError(error instanceof Error ? error.message : '小节操作失败'); }
  }
  function setSceneKind(kind: Scene['kind']) {
    if (!draft) return;
    try { player.current?.pause(); patchScene(changeSceneKind(draft.scenes[selected], kind)); setError(''); }
    catch (error) { setError(error instanceof Error ? error.message : '模板切换失败'); }
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
  const readiness = exportReadiness(draft, Object.keys(allAudio), useAudio);
  const exporting = jobs.some(job => job.status === 'queued' || job.status === 'running');
  const statuses = draft.scenes.map(s => sceneSpeechStatus(s, speech, speechConfig));
  function chooseStage(next: Stage) {
    player.current?.pause(); setStage(next); setMessage('');
    if (next === 'voice') setInspectorTab('sound');
    if (next === 'edit') setInspectorTab('text');
  }
  function openInspector(tab: InspectorTab) {
    setInspectorTab(tab); document.getElementById('scene-inspector')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const notice = error || configError || message;
  const voiceHelp = !speechConfig ? '正在读取配音服务配置…' : !speechConfig.configured ? '请先配置配音服务并重启。已有配音仍可试听。' : pendingSpeech ? '后台正在逐节生成，你可以继续编辑或稍后回来查看。' : missing.length ? '点击一次即可依次生成全部缺失配音；已有有效配音会复用。' : '全部小节已配音。播放检查后，就可以导出视频。';
  return <div className="editor-shell">
    <a className="skip-link" href="#editor-main">跳到制作区</a>
    <header className="editor-header">
      <div className="editor-brand"><Link href="/" onClick={event => { if (dirty && !window.confirm('草稿尚未保存，确定返回吗？')) event.preventDefault(); }}>知帧<span>教学视频工作台</span></Link><span className="project-name" title={draft.title}>{draft.title}</span></div>
      <div className="header-actions"><span className={dirty ? 'unsaved' : 'saved'}>{dirty ? '有未保存修改' : '已保存'}</span><button disabled={busy || !dirty} onClick={() => void saveAndMaybeExport(false)}>保存项目</button>
        {stage === 'export' ? <button className="primary" disabled={busy || exporting || !readiness.ready} onClick={() => void saveAndMaybeExport(true)}>{exporting ? '视频制作中…' : useAudio ? '导出带配音视频' : '导出无声视频'}</button>
          : <button className="primary" disabled={busy} onClick={() => chooseStage(stage === 'edit' ? 'voice' : stage === 'voice' ? 'export' : 'edit')}>{stage === 'edit' ? '下一步：生成配音' : stage === 'voice' ? '下一步：预览导出' : '进入编辑确认'}<span aria-hidden="true"> →</span></button>}
      </div>
    </header>
    <WorkflowNav stage={stage} busy={busy} onChange={chooseStage} />
    <div className="editor-body">
      <aside className="scene-sidebar" aria-label="教学小节列表">
        <div className="sidebar-title"><h2>教学小节</h2><span>{draft.scenes.length} 节</span></div>
        <p className="sidebar-help">选择小节，编辑内容或试听</p>
        <div className="scene-list">{draft.scenes.map((s, i) => <button className={`scene-item ${selected === i ? 'active' : ''}`} aria-pressed={selected === i} onClick={() => select(i)} key={s.id} disabled={busy}>
          <span className="scene-number">{String(i + 1).padStart(2, '0')}</span><span className="scene-copy"><b>{s.title || '未命名小节'}</b><small>{labels[s.kind]} · {(timeline[i].durationInFrames / 30).toFixed(1)} 秒</small><SpeechBadge status={statuses[i]} /></span>
        </button>)}</div>
        <div className="reorder"><button disabled={busy || selected === 0} onClick={() => move(-1)}>上移</button><button disabled={busy || selected === draft.scenes.length - 1} onClick={() => move(1)}>下移</button></div>
        <SceneActions count={draft.scenes.length} busy={busy} onAction={manageScene} />
        <div className="sidebar-bottom"><b>制作提示</b><p>先确认讲解，再生成配音。修改后只需更新受影响的小节。</p></div>
      </aside>
      <main className="preview-main" id="editor-main">
        {notice && <div className={'notice' + (error || configError ? ' error' : '')} role={error || configError ? 'alert' : 'status'}>{notice}{error.includes('已被修改') && <button onClick={() => { if (window.confirm('重新载入会放弃本页草稿，确定吗？')) window.location.reload(); }}>重新载入</button>}</div>}
        <section hidden={stage !== 'draft'} aria-label="生成与审核草稿">
          <div className="workspace-heading"><div><h1>从一个教学主题开始</h1><p>生成后先审核，应用到课程，再进入编辑确认。</p></div><button disabled={busy} onClick={() => chooseStage('edit')}>直接手动编辑</button></div>
          <AiPanel project={project} sceneId={scene.id} dirty={dirty} busy={busy} prepareProject={prepareProject} onApplied={applyAiProject} onBusyChange={setBusy} />
        </section>
        <section hidden={stage === 'draft'} aria-label="视频制作区">
          <div className="workspace-heading"><div><h1>{stage === 'voice' ? '为课程生成配音' : stage === 'export' ? '检查成片，准备导出' : '检查讲解与画面'}</h1><p>{stage === 'edit' ? '左侧选小节，右侧改内容，中间随时预览。' : stage === 'voice' ? '支持批量生成，也可以只重做一节。' : '带配音导出需要每节的配音与当前内容匹配。'}</p></div>
            {stage === 'edit' && <button disabled={busy} onClick={() => chooseStage('draft')}>用 AI 起草 / 改写</button>}
          </div>
          {stage === 'voice' && <section className="speech-overview" aria-label="整片配音" aria-busy={pendingSpeech}>
            <div className="speech-overview-top"><div><h2>整片配音 <span>{Object.keys(allAudio).length} / {draft.scenes.length} 节已就绪</span></h2><p>{voiceHelp}</p></div>
              <button className="primary" disabled={busy || pendingSpeech || !speechConfig?.configured || missing.length === 0} onClick={() => void generateNarration(missing)}>{pendingSpeech ? '正在生成配音…' : missing.length === draft.scenes.length ? `为全部小节生成配音（${missing.length} 节）` : missing.length ? `补齐配音（${missing.length} 节）` : '全部配音已就绪'}</button>
            </div><progress aria-label="配音完成进度" max={draft.scenes.length} value={Object.keys(allAudio).length} />
            <div className="speech-overview-bottom"><span>{Array.from(missingText).length} 字符待生成{speechConfig?.provider === 'tencent' ? ' · 腾讯云精品音色' : batchEstimate === null ? '' : ` · 参考费用 ¥${batchEstimate.toFixed(4)}`}</span><button className="text-button" onClick={() => openInspector('sound')}>试听 / 调整当前节声音</button></div>
            {speechError && <p className="error" role="alert">{speechError}</p>}
          </section>}
          {stage === 'export' && <section className={'export-check ' + (readiness.ready ? 'is-ready' : '')} aria-label="导出检查">
            <div><h2>{readiness.ready ? '可以导出视频' : `还有 ${readiness.missing.length} 节需要配音`}</h2><p>{readiness.ready ? useAudio ? '配音已匹配当前讲解。播放检查后，点击右上角导出。' : '本次将导出不带声音的视频。' : '补齐这些小节后，即可导出带配音视频。'}</p></div>
            {!readiness.ready && <><ul>{readiness.missing.map(s => <li key={s.id}>{s.title}</li>)}</ul><button className="primary" disabled={busy} onClick={() => chooseStage('voice')}>去补齐配音</button></>}
            <label className="audio-toggle"><input type="checkbox" checked={useAudio} disabled={busy} onChange={event => { player.current?.pause(); setUseAudio(event.target.checked); }} />预览与导出使用配音</label>
          </section>}
          <div className="preview-heading"><h2>视频预览</h2><span className="format">1080P · 16:9</span></div>
          <div className="player-wrap"><Player ref={player} component={LessonVideo} inputProps={{ lesson: draft, audio }} compositionWidth={1920} compositionHeight={1080} durationInFrames={totalFrames(draft.scenes, 30, audio)} fps={30} controls style={{ width: '100%', aspectRatio: '16 / 9' }} acknowledgeRemotionLicense /></div>
          <div className="preview-caption"><span>总时长 {(totalFrames(draft.scenes, 30, audio) / 30).toFixed(1)} 秒</span><span>{useAudio ? `${Object.keys(allAudio).length}/${draft.scenes.length} 节配音就绪` : '无配音预览'}</span><button className="mobile-edit text-button" onClick={() => openInspector(stage === 'voice' ? 'sound' : 'text')}>编辑当前小节</button></div>
          {stage === 'edit' && <><div className="timeline-heading"><h2>内容顺序</h2><span>点击跳转到对应小节</span></div><div className="visual-timeline">{timeline.map((entry, i) => <button key={entry.scene.id} className={selected === i ? 'active' : ''} style={{ flex: entry.durationInFrames }} onClick={() => select(i)}><span>{i + 1} / {labels[entry.scene.kind]}</span><b>{entry.scene.title}</b><small>{(entry.from / 30).toFixed(0)}s — {((entry.from + entry.durationInFrames) / 30).toFixed(0)}s</small></button>)}</div></>}
          {stage === 'voice' && <p className="workspace-tip">选中左侧小节，在右侧「声音」中试听或单独重做。确认满意后，点击「下一步：预览导出」。</p>}
          {stage === 'edit' && <div className="next-action"><span>内容确认好了？接下来批量生成配音。</span><button disabled={busy} onClick={() => chooseStage('voice')}>进入生成配音 →</button></div>}
          {stage === 'export' && <section className="exports" aria-label="视频导出记录"><div className="section-heading"><h2>导出记录</h2><span>保留提交时的内容版本</span></div>
            {exportError && <p className="error" role="alert">{exportError}</p>}
            {jobs.length === 0 ? <p className="empty-export">还没有导出记录。完成检查后，点击右上角导出视频。</p> : jobs.slice(0, 4).map(job => <div className="job-row" key={job.id}><div><b>版本 {job.version}</b><span className="job-status">{jobLabels[job.status]}{job.status === 'running' ? ` · ${Math.round(job.progress * 100)}%` : ''}</span>{job.status === 'queued' && <small>任务等待后台制作，请保持后台程序运行。</small>}{job.error && <small className="error">{job.error}</small>}</div>{job.status === 'succeeded' ? <a className="download" href={`/api/exports/${job.id}/download`}>下载 MP4</a> : <span className="muted">{new Date(job.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}</div>)}
          </section>}
        </section>
      </main>
      <aside className="inspector" id="scene-inspector" aria-label="当前小节编辑器">
        <div className="inspector-heading"><span>编辑第 {selected + 1} 小节</span><h2>{scene.title || '未命名小节'}</h2><SpeechBadge status={statuses[selected]} /></div>
        <InspectorTabs selected={inspectorTab} onChange={setInspectorTab} />
        <div role="tabpanel" id="inspector-panel" aria-labelledby={'tab-' + inspectorTab}>
          {inspectorTab === 'text' && <fieldset disabled={busy}>
            <label htmlFor="lesson-title">视频标题<input id="lesson-title" value={draft.title} maxLength={100} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
            <label htmlFor="scene-title">小节标题<input id="scene-title" value={scene.title} maxLength={60} onChange={event => patchScene({ title: event.target.value })} /></label>
            <label htmlFor="scene-narration">讲解稿<textarea id="scene-narration" rows={9} value={scene.narration} maxLength={500} onChange={event => patchScene({ narration: event.target.value })} /><small>这里的文字会朗读出来。修改后，该节配音需要更新。</small></label>
            <button type="button" className="inspector-ai" onClick={() => chooseStage('draft')}>让 AI 改写这一节</button>
          </fieldset>}
          {inspectorTab === 'visual' && <fieldset disabled={busy}>
            <label htmlFor="scene-kind">画面类型<select id="scene-kind" value={scene.kind} onChange={event => setSceneKind(event.target.value as Scene['kind'])}>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label htmlFor="scene-content">屏幕文字<textarea id="scene-content" rows={5} value={scene.content} maxLength={500} onChange={event => patchScene({ content: event.target.value })} /><small>{scene.kind === 'steps' ? '每行一步，1～5 行，每行最多 80 字。' : '每行一个要点，建议不超过 3 行。'}</small></label>
            {scene.kind === 'comparison' && scene.comparison && <ComparisonFields value={scene.comparison} onChange={comparison => patchScene({ comparison })} />}
            <label htmlFor="scene-duration">{audio[scene.id] ? '画面时长（按配音自动匹配）' : '画面时长（秒）'}<input id="scene-duration" type="number" min={3} max={60} step={0.5} disabled={!!audio[scene.id]} value={audio[scene.id] ? timeline[selected].durationInFrames / 30 : scene.durationSeconds} onChange={event => { const n = Number(event.target.value); if (Number.isFinite(n)) patchScene({ durationSeconds: Math.max(3, Math.min(60, n)) }); }} /></label>
          </fieldset>}
          {inspectorTab === 'sound' && <NarrationPanel scene={scene} projectId={projectId} assets={speech.assets} jobs={speech.jobs} config={speechConfig} busy={busy} error={speechError || configError} onChange={patchScene} onGenerate={force => void generateNarration([scene.id], force)} onListen={() => player.current?.pause()} />}
        </div>
      </aside>
    </div>
  </div>;
}
