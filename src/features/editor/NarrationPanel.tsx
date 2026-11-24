'use client';
import type { Scene } from '@/shared/scene';
import { estimateSpeechCost, narrationSignature, voiceOf } from '@/shared/narration';
import type { NarrationAsset, SpeechConfig, SpeechJob } from '@/shared/narration';
type Props = {
  scene: Scene; projectId: string; assets: NarrationAsset[]; jobs: SpeechJob[];
  config: SpeechConfig | null; busy: boolean; error: string;
  onChange: (patch: Partial<Scene>) => void; onGenerate: (force: boolean) => void; onListen: () => void;
};
export function NarrationPanel({ scene, projectId, assets, jobs, config, busy, error, onChange, onGenerate, onListen }: Props) {
  const voice = voiceOf(scene);
  const signature = narrationSignature(scene);
  const asset = assets.find(a => a.sceneId === scene.id && a.signature === signature && a.model === config?.model);
  const pending = jobs.find(j => j.sceneId === scene.id && j.signature === signature && j.model === config?.model && (j.status === 'running' || j.status === 'queued'));
  const latest = jobs.find(j => j.sceneId === scene.id && j.signature === signature && j.model === config?.model);
  const stale = !asset && assets.some(a => a.sceneId === scene.id);
  const estimate = estimateSpeechCost(scene.narration, config?.pricePer10k ?? null);
  return <section className="narration-panel" aria-label="当前小节配音">
    <div className="speech-heading"><h3>小节配音</h3><span>{pending ? (pending.status === 'running' ? '合成中' : '等待后台合成') : asset ? '已就绪' : stale ? '需要更新' : '尚未生成'}</span></div>
    {!config ? <p className="speech-help">正在读取服务配置…</p> : !config.configured && <div className="speech-config-note">尚未配置 MiniMax。请按 README 在本机配置密钥并重启服务，密钥不用填写到网页里。</div>}
    {error && <p className="error" role="alert">{error}</p>}
    <fieldset disabled={busy || !!pending}>
      <label htmlFor="voice-id">音色 ID<input id="voice-id" list="voice-options" value={voice.voiceId} maxLength={100} onChange={e => onChange({ voice: { ...voice, voiceId: e.target.value } })} /><datalist id="voice-options"><option value="male-qn-qingse">青涩青年男声</option><option value="female-shaonv">少女女声</option><option value="female-yujie">御姐女声</option></datalist><small>可从建议中选择，或填写自己账号可用的 MiniMax 音色。</small></label>
      <label htmlFor="voice-speed">语速：{voice.speed.toFixed(1)} 倍<input id="voice-speed" type="range" min={0.5} max={2} step={0.1} value={voice.speed} onChange={e => onChange({ voice: { ...voice, speed: Number(e.target.value) } })} /></label>
    </fieldset>
    <p className="speech-cost">此节 {Array.from(scene.narration).length} 字符{estimate === null ? ' · 未配置参考单价' : ` · 预计 ¥${estimate.toFixed(4)}`}<br /><small>按字符参考估算，实际计费以 MiniMax 账单为准。模型：{config?.model || '—'}</small></p>
    {asset && <div className="audio-preview"><audio aria-label="试听当前小节配音" controls preload="metadata" src={`/api/projects/${projectId}/narrations/${asset.id}`} onPlay={onListen} /><p>{asset.durationSeconds.toFixed(2)} 秒 · {asset.usageCharacters === null ? '未返回计费字符数' : `${asset.usageCharacters} 计费字符`}{asset.estimatedCny === null ? '' : ` · 参考费用 ¥${asset.estimatedCny.toFixed(4)}`}</p></div>}
    {stale && <p className="speech-help">讲解或声音设置已改变，旧音频不会进入当前预览与导出。原文件仍保留。</p>}
    {!pending && latest?.status === 'failed' && <p className="speech-failure" role="alert">{latest.error}<br />重试可能再次产生费用，请先核对厂商用量。</p>}
    <button className="speech-generate" type="button" disabled={busy || !!pending || !config?.configured || !voice.voiceId.trim()} onClick={() => onGenerate(!!asset)}>{pending ? '等待配音完成…' : asset ? '重新生成此节配音' : latest?.status === 'failed' ? '重试此节配音' : '生成此节配音'}</button>
  </section>;
}
