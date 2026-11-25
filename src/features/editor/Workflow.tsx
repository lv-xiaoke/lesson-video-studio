import type { KeyboardEvent } from 'react';
import { SPEECH_STATUS, type SceneSpeechStatus } from '@/shared/editor-workflow';
export const STAGES = [
  { id: 'draft', title: '生成草稿', hint: 'AI 起草或手动开始' },
  { id: 'edit', title: '编辑确认', hint: '检查讲解与画面' },
  { id: 'voice', title: '生成配音', hint: '批量合成与试听' },
  { id: 'export', title: '预览导出', hint: '检查成片并下载' },
] as const;
export type Stage = typeof STAGES[number]['id'];
export function WorkflowNav({ stage, busy, onChange }: { stage: Stage; busy: boolean; onChange: (stage: Stage) => void }) {
  return <nav className="workflow-nav" aria-label="制作步骤"><ol>{STAGES.map((step, index) => <li key={step.id}>
    <button type="button" disabled={busy} aria-current={stage === step.id ? 'step' : undefined} onClick={() => onChange(step.id)}>
      <span className="step-number">{index + 1}</span><span><b>{step.title}</b><small>{step.hint}</small></span>
    </button></li>)}</ol></nav>;
}
export function SpeechBadge({ status }: { status: SceneSpeechStatus }) {
  return <span className={'speech-badge status-' + status}><span aria-hidden="true" />{SPEECH_STATUS[status]}</span>;
}
const tabs = [{ id: 'text', label: '讲解' }, { id: 'visual', label: '画面' }, { id: 'sound', label: '声音' }] as const;
export type InspectorTab = typeof tabs[number]['id'];
export function InspectorTabs({ selected, onChange }: { selected: InspectorTab; onChange: (value: InspectorTab) => void }) {
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1;
    if (next < 0) return;
    event.preventDefault(); onChange(tabs[next].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
  return <div role="tablist" aria-label="编辑内容分类" className="inspector-tabs">{tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={'tab-' + tab.id} aria-controls="inspector-panel" aria-selected={selected === tab.id} tabIndex={selected === tab.id ? 0 : -1} onKeyDown={event => navigate(event, index)} onClick={() => onChange(tab.id)}>{tab.label}</button>)}</div>;
}
