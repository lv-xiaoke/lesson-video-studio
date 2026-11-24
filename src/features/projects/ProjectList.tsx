'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Project } from '@/shared/lesson';
export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState('用二分查找，快速找到一个数');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/projects').then(async r => { if (!r.ok) throw new Error('无法读取项目'); setProjects(await r.json()); }).catch(e => setError(String(e.message))).finally(() => setLoading(false)); }, []);
  async function create() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      window.location.assign(`/projects/${data.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : '创建失败'); setBusy(false); }
  }
  return <div className="home-shell">
    <header className="home-header"><Link className="brand" href="/">知帧<span>教学视频工作台</span></Link><span className="edition">本地工作室 · 第一版</span></header>
    <main className="home-main"><div className="eyebrow">从一个知识点开始</div><h1>让知识，有画面。</h1><p className="home-description">将讲解整理成小节，一边编辑，一边预览。<br />先讲清楚，再导出一条属于你的教学视频。</p>
      <section className="create-card"><div><span className="pill">创建项目</span><h2>今天想讲清楚什么？</h2><p>新项目包含一份二分查找示例，可自由修改。</p></div><form onSubmit={e => { e.preventDefault(); void create(); }}><label htmlFor="project-title">视频标题</label><div className="create-row"><input id="project-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} required disabled={busy} /><button className="primary" disabled={busy || !title.trim()}>{busy ? '正在创建…' : '进入制作'}</button></div></form></section>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="section-heading"><h2>我的项目</h2><span>{projects.length} 个项目</span></div>
      {loading ? <p className="muted">正在读取项目…</p> : projects.length === 0 ? <div className="empty">从上面的示例开始，你的制作过程会保存在本机。</div> : <div className="project-grid">{projects.map(p => <Link className="project-card" href={`/projects/${p.id}`} key={p.id}><div className="project-cover"><span>LESSON / {String(p.lesson.scenes.length).padStart(2, '0')}</span><b>{p.lesson.title}</b></div><div className="project-meta"><span>{p.lesson.scenes.reduce((sum, s) => sum + s.durationSeconds, 0)} 秒 · 版本 {p.version}</span><span>{new Date(p.updatedAt).toLocaleDateString('zh-CN')}</span></div></Link>)}</div>}
      <p className="workspace-note">当前可编辑、保存、预览，并按小节调用腾讯云或 MiniMax 生成配音、导出视频。AI 自动编稿尚未接入。</p>
    </main><footer className="home-footer">知帧 / 把制作过程留在手边</footer>
  </div>;
}
