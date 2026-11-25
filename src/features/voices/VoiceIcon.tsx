import type { CSSProperties, ReactNode } from 'react';
type IconName = 'mic' | 'plus' | 'upload' | 'file' | 'check' | 'arrow' | 'search' | 'refresh' | 'headphones' | 'edit' | 'archive';
const paths: Record<IconName, ReactNode> = {
  mic: <><rect x="8" y="2" width="8" height="13" rx="4" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="M19 12H5m6-6-6 6 6 6" />,
  search: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 11-2l3 3M18 17a7 7 0 0 1-11 2l-3-3" /></>,
  headphones: <><path d="M3 14v-3a9 9 0 0 1 18 0v3" /><rect x="3" y="12" width="4" height="9" rx="2" /><rect x="17" y="12" width="4" height="9" rx="2" /></>,
  edit: <><path d="m16 3 5 5L8 21H3v-5ZM14 5l5 5" /></>,
  archive: <><rect x="3" y="3" width="18" height="5" rx="1" /><path d="M5 8v13h14V8M10 12h4" /></>,
};
export function VoiceIcon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`voice-icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
export function VoiceWave({ compact = false }: { compact?: boolean }) {
  const heights = compact ? [8, 17, 25, 13, 31, 19, 10, 23, 15] : [13, 22, 14, 36, 51, 27, 63, 43, 24, 55, 34, 68, 42, 19, 36, 51, 25, 14, 28];
  return <span className={'voice-wave' + (compact ? ' compact' : '')} aria-hidden="true">{heights.map((height, i) => <i key={i} style={{ '--wave-height': `${height}px` } as CSSProperties} />)}</span>;
}
