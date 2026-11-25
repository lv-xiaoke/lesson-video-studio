'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Project } from '@/shared/lesson';
import type { AiConfig, AiInput, AiJob } from '@/shared/ai';
import { parseAiInput } from '@/shared/ai-validation';
import { currentAiDraft, draftActionState } from '@/shared/ai-editor';
import { request } from './api';
import { AiDraftPreview } from './AiDraftPreview';

export type AiPanelProps = {
  project: Project; sceneId: string; dirty: boolean; busy: boolean;
  prepareProject: () => Promise<Project>; onApplied: (project: Project) => void;
  onBusyChange: (busy: boolean) => void;
};
const statuses = { queued: '等待后台生成', running: 'DeepSeek 正在生成', succeeded: '草稿待审核', failed: '生成失败', applied: '草稿已应用', undone: '已撤销应用', discarded: '已放弃' };
export function AiPanel({ project, sceneId, dirty, busy, prepareProject, onApplied, onBusyChange }: AiPanelProps) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [topic, setTopic] = useState(project.lesson.title);
  const [audience, setAudience] = useState('零基础学习者');
  const [seconds, setSeconds] = useState(120);
  const [instruction, setInstruction] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [configError, setConfigError] = useState('');
  const [message, setMessage] = useState('');
  const path = '/api/projects/' + project.id + '/ai';
  const refresh = useCallback(async () => { setJobs(await request<AiJob[]>(path)); }, [path]);
  useEffect(() => {
    let active = true;
    request<AiConfig>('/api/ai/config').then(c => { if (active) setConfig(c); }).catch(() => { if (active) setConfigError('无法读取 AI 服务配置，请刷新后重试。'); });
    const poll = async () => {
      try { const result = await request<AiJob[]>(path); if (active) { setJobs(result); setLoadError(''); } }
      catch { if (active) setLoadError('暂时无法读取 AI 草稿，将自动重新读取状态。'); }
    };
    void poll(); const timer = setInterval(poll, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [path]);
  const current = currentAiDraft(jobs, selectedJobId);
  const pending = jobs.some(j => j.status === 'queued' || j.status === 'running');
  const unavailable = busy || requestBusy || pending || !config?.configured;
  const state = current ? draftActionState(current, project.version, dirty) : null;
  const selectedScene = project.lesson.scenes.find(s => s.id === sceneId);
  async function generate(raw: AiInput) {
    setRequestBusy(true); setError(''); setMessage('');
    try {
      const input = parseAiInput(raw);
      const saved = await prepareProject();
      const job = await request<AiJob>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: saved.version, input }) });
      setJobs(list => [job, ...list.filter(j => j.id !== job.id)]);
      setSelectedJobId(job.id);
      setMessage('已提交生成任务。完成后请先检查草稿，再决定是否应用。');
    } catch (e) { setError(e instanceof Error ? e.message : 'AI 请求失败'); }
    finally { setRequestBusy(false); }
  }
  async function mutate(action: 'apply' | 'undo' | 'discard') {
    if (!current) return;
    setRequestBusy(true); setError(''); setMessage(''); onBusyChange(true);
    try {
      const result = await request<{ job: AiJob; project: Project }>(path + '/' + current.id, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, version: project.version }),
      });
      if (action !== 'discard') onApplied(result.project);
      await refresh();
      setMessage(action === 'apply' ? '草稿已应用，请检查内容，再手动生成配音。' : action === 'undo' ? '已恢复应用前的课程，撤销记录已保存。' : '已放弃这份结果，当前课程保持原样。');
    } catch (e) { setError(e instanceof Error ? e.message : '草稿操作失败'); }
    finally { setRequestBusy(false); onBusyChange(false); }
  }
  return <details className="ai-panel" open>
    <summary><span>AI 备课助手</span><small>{config?.configured ? 'DeepSeek 已配置' : config ? '尚未配置 DeepSeek' : '正在读取配置…'}</small></summary>
    <div className="ai-panel-body">
      <p className="ai-intro">AI 帮你安排小节和编写讲解，生成后由你审核、应用，再配音。每次生成会调用 DeepSeek API。</p>
      {config && !config.configured && <p className="speech-config-note">尚未配置 DeepSeek。请在本机 .env.local 填写 DEEPSEEK_API_KEY，重启网页和后台程序。手动制作仍可使用。</p>}
      <fieldset disabled={unavailable} className="ai-course-form">
        <label htmlFor="ai-topic">教学主题<input id="ai-topic" maxLength={200} value={topic} onChange={e => setTopic(e.target.value)} /></label>
        <div className="ai-form-row"><label htmlFor="ai-audience">教学对象<input id="ai-audience" maxLength={80} value={audience} onChange={e => setAudience(e.target.value)} /></label>
          <label htmlFor="ai-seconds">期望时长（秒）<input id="ai-seconds" type="number" min={30} max={600} step={10} value={seconds} onChange={e => setSeconds(Number(e.target.value))} /></label></div>
        <button type="button" className="primary" onClick={() => void generate({ kind: 'lesson', topic, audience, targetSeconds: seconds })}>生成课程草稿</button>
      </fieldset>
      <div className="ai-rewrite"><b>改写当前小节：{selectedScene?.title || '当前未保存的新小节'}</b>
        <label htmlFor="ai-instruction">修改要求<textarea id="ai-instruction" disabled={unavailable} rows={2} maxLength={1000} value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="例如：讲简单一点，加一个生活中的例子。" /></label>
        <button type="button" disabled={unavailable || !instruction.trim()} onClick={() => void generate({ kind: 'scene', sceneId, instruction })}>生成此节改写草稿</button>
      </div>
      {(error || configError || loadError) && <p role="alert" className="error">{error || configError || loadError}</p>}
      {message && <p role="status" className="ai-message">{message}</p>}
      {current && <section className="ai-result">
        <label htmlFor="ai-history">查看草稿记录<select id="ai-history" value={current.id} disabled={busy || requestBusy} onChange={event => setSelectedJobId(event.target.value)}>
          {jobs.filter(job => job.status !== 'discarded').map(job => <option key={job.id} value={job.id}>{new Date(job.createdAt).toLocaleString()} · {statuses[job.status]} · {job.input.kind === 'lesson' ? job.input.topic : '单节改写'} · {job.id.slice(0, 6)}</option>)}
        </select></label>
        <div className="ai-result-heading"><b>{statuses[current.status]}</b><small>{current.input.kind === 'lesson' ? '整份课程' : '指定小节'} · {current.model}</small></div>
        {pending && <p className="speech-help">请保持后台制作程序运行。你可以继续编辑课程；有修改时，旧草稿将不能直接覆盖新版本。</p>}
        {current.status === 'failed' && <p className="speech-failure" role="alert">{current.error}<br />不会自动重试，请核对用量后再重新生成。</p>}
        <AiDraftPreview job={current} />
        {state?.reason && <p className="speech-help">{state.reason}</p>}
        <div className="ai-result-actions">
          {current.status === 'succeeded' && <button className="primary" disabled={busy || requestBusy || !state?.canApply} onClick={() => void mutate('apply')}>{current.input.kind === 'lesson' ? '应用并替换整份课程' : '应用到此小节'}</button>}
          {current.status === 'applied' && <button disabled={busy || requestBusy || !state?.canUndo} onClick={() => void mutate('undo')}>撤销这次应用</button>}
          {['succeeded', 'failed'].includes(current.status) && <button disabled={busy || requestBusy} onClick={() => void mutate('discard')}>放弃这份结果</button>}
          {current.status === 'failed' && <button disabled={unavailable} onClick={() => void generate(current.input)}>按原要求重新生成</button>}
        </div>
      </section>}
    </div>
  </details>;
}
