'use client';
import { useEffect, useState } from 'react';
import type { AsrConfig, VoiceImport } from '@/shared/voice-import';
import { MAX_MEDIA_BYTES, parseMediaSelection } from '@/shared/voice-import';
import type { VoiceProfile } from '@/shared/voices';
import { request } from '../editor/api';
import { VoiceIcon } from './VoiceIcon';

export function MediaImport({ config, onCreated, onVoiceSaved }: { config: AsrConfig | null; onCreated: (job: VoiceImport) => void; onVoiceSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null); const [url, setUrl] = useState('');
  const [start, setStart] = useState('0'); const [duration, setDuration] = useState('20');
  const [length, setLength] = useState<number | null>(null); const [mediaError, setMediaError] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [manualName, setManualName] = useState(''); const [manualText, setManualText] = useState(''); const [manualFile, setManualFile] = useState<File | null>(null);
  useEffect(() => { if (!file) { setUrl(''); return; } const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  async function upload(event: React.FormEvent) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const selection = parseMediaSelection(file.name, Number(start), Number(duration));
      if (length !== null && selection.start + selection.duration > length + .1) throw new Error('所选片段超出文件时长，请缩短片段');
      const params = new URLSearchParams({ filename: file.name, start: String(selection.start), duration: String(selection.duration) });
      const job = await request<VoiceImport>(`/api/voice-imports?${params}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
      onCreated(job); setMessage('已上传，后台将提取声音并识别。你可以稍后回来查看。');
    } catch (e) { setError(e instanceof Error ? e.message : '上传失败'); }
    finally { setBusy(false); }
  }
  async function manualUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!manualFile) return; const formElement = event.currentTarget;
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.set('audio', manualFile); form.set('name', manualName); form.set('referenceText', manualText);
      await request<VoiceProfile>('/api/voices', { method: 'POST', body: form });
      await onVoiceSaved(); setManualFile(null); setManualName(''); setManualText(''); formElement.reset(); setMessage('手动音色已保存，可在「我的音色」中管理并试听。');
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); } finally { setBusy(false); }
  }
  return <section id="voice-import-form" className="voice-import-form" aria-labelledby="import-title">
    <div className="voice-section-title"><span className="voice-step">01</span><div><h2 id="import-title">导入声音素材</h2><p>一段清晰的单人讲话就够了。</p></div></div>
    <form onSubmit={event => void upload(event)}>
      <fieldset disabled={busy}>
        <label htmlFor="voice-media-file" className={'voice-upload-zone' + (file ? ' has-file' : '')}><input id="voice-media-file" className="voice-file-input" type="file" aria-label={file ? '更换视频或录音' : '选择视频或录音'} aria-describedby="voice-file-caption voice-file-format" accept=".mp4,.mov,.m4v,.webm,.mkv,.wav,.mp3" required onChange={event => {
          const selected = event.target.files?.[0] || null; setError(''); setMessage(''); setLength(null); setMediaError(false); setStart('0'); setDuration('20');
          if (selected && selected.size > MAX_MEDIA_BYTES) { setError('文件超过 200 MB，请先裁剪视频'); setFile(null); event.target.value = ''; } else setFile(selected);
        }} /><span className="upload-symbol"><VoiceIcon name={file ? 'file' : 'upload'} /></span><strong>{file ? '更换视频或录音' : '选择视频或录音'}</strong><span className="upload-description" id="voice-file-caption">{file ? file.name : '从一段声音，创建可反复使用的音色'}</span><span className="upload-format" id="voice-file-format">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ` : ''}MP4 / MOV / WebM / MKV / WAV / MP3 等 · 最大 200 MB</span></label>
        {url && <div className="source-player"><video controls preload="metadata" src={url} aria-label="导入媒体预览" onLoadedMetadata={event => { const value = event.currentTarget.duration; if (Number.isFinite(value)) { setLength(value); setDuration(String(Math.floor(Math.min(20, value) * 100) / 100)); } }} onError={() => setMediaError(true)} /><p>{length !== null ? `源文件时长 ${length.toFixed(2)} 秒` : mediaError ? '浏览器无法预览此格式，仍可填写范围，由后台提取。' : '正在读取预览…'}</p></div>}
        <div className="clip-range"><label htmlFor="clip-start">从第几秒开始<span className="number-input-wrap"><input id="clip-start" type="number" min={0} max={7200} step={.01} required value={start} onChange={e => setStart(e.target.value)} /><span aria-hidden="true">秒</span></span></label><label htmlFor="clip-duration">提取多少秒<span className="number-input-wrap"><input id="clip-duration" type="number" min={3} max={30} step={.01} required value={duration} onChange={e => setDuration(e.target.value)} /><span aria-hidden="true">秒</span></span></label></div>
        <p className="voice-clip-tip"><VoiceIcon name="mic" /><span>选取 3～30 秒，建议 10～20 秒。尽量避开音乐和多人同时讲话。</span></p>
        <button type="submit" className="primary" disabled={!file || !config?.configured}><VoiceIcon name="upload" />{busy ? '正在上传，请稍候…' : '提取声音并自动识别'}</button>
      </fieldset>
    </form>
    {!config?.configured && <p className="voice-help" role="status">{config?.reason || '正在检查本地识别服务…'}</p>}
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="voice-notice" role="status">{message}</p>}
    <details className="manual-voice"><summary>已有录音和文字？手动添加</summary><form onSubmit={event => void manualUpload(event)}><fieldset disabled={busy}>
      <label>音色名称<input value={manualName} maxLength={40} required onChange={e => setManualName(e.target.value)} /></label>
      <label>参考录音<input type="file" accept=".wav,.mp3" required onChange={e => setManualFile(e.target.files?.[0] || null)} /><small>3～30 秒，WAV/MP3，不超过 10 MB。</small></label>
      <label>录音准确原文<textarea value={manualText} maxLength={1000} rows={4} required onChange={e => setManualText(e.target.value)} /></label>
      <button type="submit" disabled={!manualFile || !manualName.trim() || !manualText.trim()}>保存手动音色</button>
    </fieldset></form></details>
  </section>;
}
