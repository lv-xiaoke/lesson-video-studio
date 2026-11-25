import type { AiJob } from '@/shared/ai';
import { SCENE_LABELS } from '@/shared/scene';
export function AiDraftPreview({ job }: { job: AiJob }) {
  if (!job.result) return null;
  const input = job.input;
  const scenes = input.kind === 'scene' ? job.result.scenes.filter(s => s.id === input.sceneId) : job.result.scenes;
  return <div className="ai-draft-preview" aria-label="AI 草稿预览">
    <div className="ai-draft-title"><b>{job.input.kind === 'lesson' ? job.result.title : '当前小节改写草稿'}</b><span>{scenes.length} 节 · 基于版本 {job.baseVersion}</span></div>
    <div className="ai-draft-scenes">{scenes.map((scene, i) => <article key={scene.id}>
      <span className="ai-template">{i + 1} · {SCENE_LABELS[scene.kind]}</span><h4>{scene.title}</h4>
      <p className="ai-field-label">屏幕文字</p><p className="ai-screen-copy">{scene.content}</p>
      {scene.comparison && <div className="ai-comparison">{[
        { title: scene.comparison.leftTitle, points: scene.comparison.leftPoints },
        { title: scene.comparison.rightTitle, points: scene.comparison.rightPoints },
      ].map((side, index) => <div key={index}><b>{side.title}</b><ul>{side.points.map((p, n) => <li key={n}>{p}</li>)}</ul></div>)}</div>}
      <p className="ai-field-label">讲解稿</p><p>{scene.narration}</p>
    </article>)}</div>
  </div>;
}
