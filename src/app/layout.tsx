import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '知帧 · 教学视频工作台', description: '把知识整理成小节，编辑画面，预览并导出教学视频。' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
