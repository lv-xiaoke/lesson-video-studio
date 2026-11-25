'use client';
import Link from 'next/link';
import { useState } from 'react';
export function VoiceLibrary({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <div className="voice-library">
    <Link href="/voices" target="_blank" rel="noopener noreferrer">打开独立音色库：上传视频 / 自动识别 / 管理音色</Link>
    <p className="speech-help">在新页面保存音色后，返回这里选择。课程草稿会保留。</p>
    <button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onRefresh(); } catch { setError('刷新失败，请稍后重试'); } finally { setBusy(false); } }}>{busy ? '正在刷新…' : '刷新音色列表'}</button>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
