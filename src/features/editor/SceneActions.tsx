export function SceneActions({ count, busy, onAction }: { count: number; busy: boolean; onAction: (action: 'add' | 'copy' | 'remove') => void }) {
  return <div className="scene-actions" aria-label="管理小节">
    <button disabled={busy || count >= 20} onClick={() => onAction('add')}>新增小节</button>
    <button disabled={busy || count >= 20} onClick={() => onAction('copy')}>复制当前节</button>
    <button disabled={busy || count <= 1} onClick={() => onAction('remove')}>删除当前节</button>
    <small>最多 20 节；修改后保存项目。</small>
  </div>;
}
