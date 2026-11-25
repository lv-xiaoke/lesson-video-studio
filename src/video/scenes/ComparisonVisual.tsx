import type { ComparisonContent } from '../../shared/scene';
import { interpolate, useCurrentFrame } from 'remotion';
export function ComparisonVisual({ content }: { content: ComparisonContent }) {
  const frame = useCurrentFrame();
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30 }}>{[
    { title: content.leftTitle, points: content.leftPoints, accent: '#c6d7ea' },
    { title: content.rightTitle, points: content.rightPoints, accent: '#a8e8c6' },
  ].map((side, index) => {
    const compact = side.points.length > 3 || side.points.some(v => v.length > 35);
    return <div key={index} style={{ background: '#20353e', borderRadius: 20, padding: '22px 28px', opacity: interpolate(frame, [12 + index * 8, 25 + index * 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
      <h2 style={{ fontSize: side.title.length > 15 ? 28 : 38, color: side.accent, margin: '0 0 18px', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{side.title}</h2>
      <div style={{ display: 'grid', gap: 14 }}>{side.points.map((point, i) => <div key={i} style={{ fontSize: compact ? 22 : 32, lineHeight: 1.5, overflowWrap: 'anywhere', display: 'flex', gap: 12 }}><span style={{ color: side.accent }}>•</span><span>{point}</span></div>)}</div>
    </div>;
  })}</div>;
}
