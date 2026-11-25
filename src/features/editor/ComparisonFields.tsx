import type { ComparisonContent } from '@/shared/scene';
export function ComparisonFields({ value, onChange }: { value: ComparisonContent; onChange: (value: ComparisonContent) => void }) {
  return <div className="comparison-fields">{(['left', 'right'] as const).map(side => {
    const titleKey = side === 'left' ? 'leftTitle' : 'rightTitle';
    const pointsKey = side === 'left' ? 'leftPoints' : 'rightPoints';
    return <div key={side}>
      <label htmlFor={side + '-title'}>{side === 'left' ? '左侧标题' : '右侧标题'}<input id={side + '-title'} maxLength={30} value={value[titleKey]} onChange={e => onChange({ ...value, [titleKey]: e.target.value })} /></label>
      <label htmlFor={side + '-points'}>{side === 'left' ? '左侧要点' : '右侧要点'}<textarea id={side + '-points'} rows={4} maxLength={243} value={value[pointsKey].join('\n')} onChange={e => onChange({ ...value, [pointsKey]: e.target.value.split('\n') })} /><small>每行一个要点，1～4 行，每行最多 60 字。</small></label>
    </div>;
  })}</div>;
}
