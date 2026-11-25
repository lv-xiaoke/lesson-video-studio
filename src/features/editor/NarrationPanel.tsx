'use client';
import type { Scene } from '@/shared/scene';
import { estimateSpeechCost, narrationSignature, TENCENT_VOICES, voiceOf } from '@/shared/narration';
import type { NarrationAsset, SpeechConfig, SpeechJob } from '@/shared/narration';
import type { SpeechProvider, VoiceSettings } from '@/shared/narration';
import type { VoiceProfile } from '@/shared/voices';
import { VoiceLibrary } from './VoiceLibrary';
type Props = {
  scene: Scene; projectId: string; assets: NarrationAsset[]; jobs: SpeechJob[];
  config: SpeechConfig | null; busy: boolean; error: string;
  intendedProvider?: SpeechProvider;
  onChange: (patch: Partial<Scene>) => void; onGenerate: (force: boolean) => void; onListen: () => void;
  voices: VoiceProfile[]; onRefreshVoices: () => Promise<void>; onProviderChange: (provider: SpeechProvider) => void; onApplyAll: (voice: VoiceSettings) => void;
};
export function NarrationPanel({ scene, projectId, assets, jobs, config, busy, error, onChange, onGenerate, onListen, voices, onRefreshVoices, onProviderChange, onApplyAll, intendedProvider }: Props) {
  const provider = intendedProvider || config?.provider || 'tencent';
  const isTencent = provider === 'tencent';
  const isLocal = provider === 'zipvoice';
  const providerName = isLocal ? '本地 ZipVoice' : isTencent ? '腾讯云' : 'MiniMax';
  const voice = voiceOf(scene, provider);
  const signature = narrationSignature(scene, provider);
  const asset = assets.find(a => a.sceneId === scene.id && a.signature === signature && a.model === config?.model);
  const pending = jobs.find(j => j.sceneId === scene.id && j.signature === signature && j.model === config?.model && (j.status === 'running' || j.status === 'queued'));
  const latest = jobs.find(j => j.sceneId === scene.id && j.signature === signature && j.model === config?.model);
  const stale = !asset && assets.some(a => a.sceneId === scene.id);
  const estimate = estimateSpeechCost(scene.narration, config?.pricePer10k ?? null);
  const validVoice = isLocal ? voices.some(v => v.id === voice.voiceId) : !!voice.voiceId && voice.voiceId !== 'unselected';
  return <section className="narration-panel" aria-label="当前小节配音">
    <div className="speech-heading"><h3>小节配音</h3><span>{pending ? (pending.status === 'running' ? '合成中' : '等待后台合成') : asset ? '已就绪' : stale ? '需要更新' : '尚未生成'}</span></div>
    <label htmlFor="speech-provider">配音服务<select id="speech-provider" value={provider} disabled={busy || !config} onChange={event => onProviderChange(event.target.value as SpeechProvider)}><option value="tencent">腾讯云</option><option value="minimax">MiniMax</option><option value="zipvoice">本地 ZipVoice · 无 API 费用</option></select><small>只影响当前课程。切换后需要重新选择音色。</small></label>
    {!config ? <p className="speech-help">正在读取服务配置…</p> : !config.configured && <div className="speech-config-note">{isLocal ? config.reason : `尚未配置${providerName}。请按 README 在本机配置密钥并重启服务。`}</div>}
    {error && <p className="error" role="alert">{error}</p>}
    <fieldset disabled={busy || !!pending || !config}>
      {isLocal ? <label htmlFor="voice-id">我的本地音色<select id="voice-id" value={validVoice ? voice.voiceId : 'unselected'} onChange={e => onChange({ voice: { ...voice, voiceId: e.target.value } })}><option value="unselected" disabled>请选择音色</option>{voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select><small>{voices.length ? '音色来自本机已保存的参考录音。' : '先在下方「管理我的音色」上传录音。'}</small></label> : isTencent ? <label htmlFor="voice-id">腾讯云精品音色<select id="voice-id" value={voice.voiceId} onChange={e => onChange({ voice: { ...voice, voiceId: e.target.value } })}><option value="unselected" disabled>请选择音色</option>{TENCENT_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select><small>使用基础/精品音色资源包。较长讲解会自动分段合成。</small></label>
        : <label htmlFor="voice-id">音色 ID<input id="voice-id" list="voice-options" value={voice.voiceId} maxLength={100} onChange={e => onChange({ voice: { ...voice, voiceId: e.target.value } })} /><datalist id="voice-options"><option value="male-qn-qingse">青涩青年男声</option><option value="female-shaonv">少女女声</option><option value="female-yujie">御姐女声</option></datalist><small>可从建议中选择，或填写自己账号可用的 MiniMax 音色。</small></label>}
      <label htmlFor="voice-speed">语速：{isTencent ? '约 ' : ''}{voice.speed.toFixed(1)} 倍<input id="voice-speed" type="range" min={isTencent ? 0.6 : 0.5} max={2} step={0.1} value={voice.speed} onChange={e => onChange({ voice: { ...voice, speed: Number(e.target.value) } })} /></label>
      <button type="button" disabled={!validVoice} onClick={() => onApplyAll(voice)}>将此音色和语速应用到全部小节</button>
    </fieldset>
    {isLocal && <VoiceLibrary onRefresh={onRefreshVoices} />}
    <p className="speech-cost">此节 {Array.from(scene.narration).length} 字符{isLocal ? ' · 本机 CPU 生成，无 API 费用' : isTencent ? ' · 腾讯云配音' : estimate === null ? ' · 未配置参考单价' : ` · 预计 ¥${estimate.toFixed(4)}`}<br /><small>{isLocal ? '生成时请保持本地引擎和后台程序运行。' : isTencent ? '剩余额度与到期时间请在腾讯云控制台查看，后付费保持关闭。' : `按字符参考估算，实际计费以 MiniMax 账单为准。模型：${config?.model || '—'}`}</small></p>
    {asset && <div className="audio-preview"><audio aria-label="试听当前小节配音" controls preload="metadata" src={`/api/projects/${projectId}/narrations/${asset.id}`} onPlay={onListen} /><p>{asset.durationSeconds.toFixed(2)} 秒 · {asset.usageCharacters === null ? '未返回计费字符数' : `${asset.usageCharacters} 计费字符`}{asset.estimatedCny === null ? '' : ` · 参考费用 ¥${asset.estimatedCny.toFixed(4)}`}</p></div>}
    {stale && <p className="speech-help">讲解或声音设置已改变，旧音频不会进入当前预览与导出。原文件仍保留。</p>}
    {!pending && latest?.status === 'failed' && <p className="speech-failure" role="alert">{latest.error}<br />{isLocal ? '请检查本地服务状态后重试。' : '重试可能再次产生费用，请先核对厂商用量。'}</p>}
    <button className="speech-generate" type="button" disabled={busy || !!pending || !config?.configured || !validVoice} onClick={() => onGenerate(!!asset)}>{pending ? '等待配音完成…' : asset ? '重新生成此节配音' : latest?.status === 'failed' ? '重试此节配音' : '生成此节配音'}</button>
  </section>;
}
