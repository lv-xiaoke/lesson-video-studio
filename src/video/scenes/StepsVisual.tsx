import { interpolate, useCurrentFrame } from 'remotion';
export function StepsVisual({ content }: { content: string }) {
  const frame = useCurrentFrame();
  const lines = content.split('\n').map(v => v.trim()).filter(Boolean);
  const compact = lines.length > 3 || lines.some(v => v.length > 40);
  const fontSize = lines.some(v => v.length > 50) ? 22 : compact ? 28 : 36;
  return <div style={{ display: 'grid', gap: 8 }}>{lines.map((line, i) => <div key={i} style={{
    display: 'flex', alignItems: 'center', gap: 22, padding: compact ? '6px 22px' : '14px 26px', borderRadius: 15,
    background: '#203a40', opacity: interpolate(frame, [15 + i * 12, 27 + i * 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  }}><span style={{ color: '#a8e8c6', fontSize: 27, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span><span style={{ fontSize, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{line}</span></div>)}</div>;
}
