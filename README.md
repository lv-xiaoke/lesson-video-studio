# 知帧 · AI 教学视频工作台

使用 Next.js、React 与 Remotion，将教学内容组织成小节，在网页中编辑、保存、预览并提交后台制作视频。

当前是本地单人使用的第一阶段：手写示例 → 编辑画面与讲解稿 → 保存到 SQLite → 预览 → 后台导出无配音 MP4。尚未接入模型、配音服务和多人登录。

## 环境与安装

- Node.js 24 或以上（本项目使用内置 SQLite 和 TypeScript 类型擦除）。
- npm。
- 首次导出需要下载 Chromium 与相关渲染工具，或配置可用的 Chrome / Chromium。

```powershell
npm install
Copy-Item .env.example .env.local
```

真实配置不要提交 Git。默认数据放在项目根目录 `data/`，可通过 `DATA_DIR` 修改。Web 和 Worker 必须在同一项目根目录运行，并使用同一份配置。

## 启动

终端一：

```powershell
npm run dev
```

打开 http://127.0.0.1:3000 ，创建项目并进入编辑器。

终端二：

```powershell
npm run worker
```

点击“导出视频”后可关闭网页，Worker 会继续工作；完成后重新打开项目下载 MP4。一次仅启动一个 Worker。修改视频组件代码后需要重启 Worker，以刷新打包缓存。

可选的 Remotion 开发界面：

```powershell
npm run studio
```

## 使用示例

1. 在首页创建一个项目，系统载入三小节二分查找示例。
2. 编辑小节标题、屏幕文字、讲解稿与时长，播放器即时预览。
3. 保存项目。刷新页面后，内容从 SQLite 恢复。
4. 启动 Worker，点击“导出视频”，查看制作状态与错误。
5. 完成后下载 MP4；导出结果固定使用提交时的版本，之后可继续编辑。

数组演示画面目前是固定的二分查找示例。标题和总结画面适合编辑文字；屏幕文字建议不超过三行，讲解稿建议保持简短。当前不执行自然语言指令，不自动生成配音；不要把示例字幕当作已配音。

## 验证命令

```powershell
npm test
npm run typecheck
npm run build
```

Web 和 Worker 启动后，可以运行一次实际接口和导出验收（会新增一个名为“二分查找 · 本地验收样片”的项目）：

```powershell
node scripts/verify-app.mjs
```

它会检查同源创建、保存、重新读取、旧版本冲突和真实 MP4 下载，结果记录在 `data/verification.json`。

测试覆盖时间计算、输入校验、并发版本保护、后台任务快照、Worker 互斥与本机请求来源检查。业务数据测试使用内存 SQLite；锁测试在 `data/test-runs/` 创建独立数据库，不改动真实项目数据。

## 目录

- `src/app/`：页面、项目与导出接口。
- `src/features/`：项目列表和编辑界面。
- `src/shared/`：项目、小节、任务的数据定义。
- `src/video/`：预览与导出共用的教学画面和时间安排。
- `src/server/`：SQLite、文件存储和视频导出。
- `src/worker/`：后台任务执行入口。
- `data/`：真实数据库、生成视频和导出清单，不提交 Git。
- `docs/architecture/project-structure.md`：目标目录设计；未实现的目录随功能增加。
- `docs/plans/2026-11-24-progress.md`：本次执行记录与验证情况。

## 部署范围

本版本仅绑定本机地址，适合在自己的电脑上使用。未实现用户认证、服务配额或云端文件存储；对外部署前需要补齐这些能力。运行 Web 与 Worker 的机器应使用相同字体，以保证预览与导出的字体一致。

Remotion 的商用许可独立于本项目代码，请按其[官方许可](https://www.remotion.dev/pricing)确认适用条件。
