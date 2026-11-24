import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { Scene } from '../../shared/scene';
export function TeachingScene({ scene, index, total }: { scene: Scene; index: number; total: number }) {
  const frame = useCurrentFrame();
  const lift = interpolate(frame, [0, 20], [25, 0], { extrapolateRight: 'clamp' });
  const narrowed = frame > 80;
  return <AbsoluteFill style={{ padding: '70px 110px', transform: `translateY(${lift}px)` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9eb8b1', fontSize: 24, letterSpacing: 3 }}><span>LEARN / 用画面理解知识</span><span>{String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span></div>
    <div style={{ height: 4, width: 70, background: '#a8e8c6', marginTop: 45, marginBottom: 48 }} />
    <h1 style={{ fontSize: scene.kind === 'title' ? 88 : 66, lineHeight: 1.35, margin: 0, maxWidth: 1550, overflowWrap: 'anywhere' }}>{scene.title}</h1>
    {scene.kind === 'array' ? <div style={{ marginTop: 80 }}>
      <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>{[1, 3, 5, 7, 9, 11, 13].map((value, i) => <div key={value} style={{ width: 155, height: 150, borderRadius: 17, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 64, background: i === 3 && !narrowed ? '#a8e8c6' : '#263d46', color: i === 3 && !narrowed ? '#102b23' : '#e8f3ed', opacity: narrowed && i <= 3 ? 0.22 : 1 }} >{value}</div>)}</div>
      <p style={{ fontSize: 34, textAlign: 'center', color: '#a8e8c6', margin: '40px 0 0' }}>{narrowed ? '缩小范围，继续向右查找' : '中间值是 7，目标值是 11'}</p>
      <p style={{ fontSize: 29, textAlign: 'center', color: '#b0c6c0', whiteSpace: 'pre-line', margin: '15px 0 0' }}>{scene.content}</p>
    </div> : <div style={{ marginTop: 55, display: 'grid', gap: 23 }}>{scene.content.split('\n').filter(Boolean).map((line, i) => <div key={i} style={{ display: 'flex', gap: 22, alignItems: 'center', opacity: interpolate(frame, [18 + i * 16, 32 + i * 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), fontSize: scene.kind === 'title' ? 47 : 38, color: '#c3d8d0', overflowWrap: 'anywhere' }}><span style={{ color: '#a8e8c6' }}>{scene.kind === 'summary' ? `0${i + 1}` : '—'}</span>{line}</div>)}</div>}
    <div style={{ position: 'absolute', bottom: 65, left: 110, right: 110, paddingTop: 23, borderTop: '1px solid #36504f', color: '#d6e7df', fontSize: 25, lineHeight: 1.8 }}>{scene.narration}</div>
  </AbsoluteFill>;
}
