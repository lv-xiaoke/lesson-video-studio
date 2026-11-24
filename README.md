# 知帧 · AI 教学视频工作台

使用 Next.js、React 与 Remotion，将教学内容组织成小节，在网页中编辑、保存、预览并提交后台制作视频。

当前是本地单人使用的第二阶段：编辑讲解稿与画面 → 分小节生成 MiniMax 配音 → 按实际音频时长预览 → 导出带配音 MP4。支持试听、局部重做、缓存复用与参考费用。AI 自动编稿和多人登录尚未接入；无密钥时仍可编辑、保存和导出无声视频。

## 环境与安装

- Node.js 24 或以上（本项目使用内置 SQLite 和 TypeScript 类型擦除）。
- npm。
- 首次导出需要下载 Chromium 与相关渲染工具，或配置可用的 Chrome / Chromium。

```powershell
npm install
Copy-Item .env.example .env.local
```

真实配置不要提交 Git。默认数据放在项目根目录 `data/`，可通过 `DATA_DIR` 修改。Web 和 Worker 必须在同一项目根目录运行，并使用同一份配置。

### 配置 MiniMax

已有 `.env.local` 时，只追加下面的配置，不要覆盖已有内容：

```dotenv
MINIMAX_API_KEY=你的本机密钥
MINIMAX_TTS_MODEL=speech-2.6-hd
MINIMAX_PRICE_PER_10K_CHARS=
```

- 密钥在 MiniMax 开放平台创建，仅写入本机 `.env.local`，不放入网页、源码、聊天或 Git。
- 参考单价为每一万字符的人民币价格，请按你的实际套餐填写。不填写时显示字符数，不虚构金额；填写后显示的金额也不等于厂商最终账单。
- 配置修改后重启 Web 和 Worker。默认使用 `https://api.minimax.cn/v1/t2a_v2`；如你的账户需要不同官方接入地址，可设置 `MINIMAX_TTS_ENDPOINT`。
- 未配置密钥时生成按钮不可用，已有配音仍可试听，已有内容可无声导出。
- 默认音色为 `male-qn-qingse`；可以在编辑器选择建议音色，或填写账号实际可用的音色 ID。

正式接口依据：[MiniMax 同步语音合成](https://platform.minimax.cn/docs/api-reference/speech-t2a-http)。本阶段使用非流式 MP3 与厂商返回的实际音频时长，进行小节级同步，尚未实现逐字高亮。

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
2. 编辑小节标题、屏幕文字、讲解稿与时长，播放器即时预览；选择音色和语速。
3. 保存项目。刷新页面后，内容从 SQLite 恢复。
4. 启动 Worker，按节生成配音或批量补齐。配音操作会先保存当前草稿。
5. 完成后单节试听。勾选“预览与导出使用配音”，画面按实际音频时长加 0.35 秒结尾停顿计算，最短为 3 秒。
6. 点击“导出带配音视频”；需要每一节都有与当前文字、音色、语速和配置模型匹配的配音。取消勾选可导出无声版本。
7. 完成后下载 MP4；导出固定提交时的内容与音频资产，之后仍可继续编辑。

数组演示画面目前是固定的二分查找示例。标题和总结画面适合编辑文字；屏幕文字建议不超过三行，讲解稿建议保持简短。当前不执行自然语言指令。

### 修改与重试

- 只改标题、画面或小节顺序时，仍匹配的配音可复用，不重新调用厂商。
- 修改讲解、音色、语速或配置模型后，旧音频保留，但不会作为当前有效配音进入预览和新导出。
- 重做某一节只创建该节的新音频，其他节保持不变。旧任务完成不会覆盖新讲解。
- 同一个进行中任务重复提交会返回原任务；失败不自动重试，防止隐式重复计费。超时或中断后，请先核对厂商用量，再手动重试。
- 新配音失败时保留此前有效音频，不自动删除生成文件。

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

配音协议与实际带音轨导出验收（需要已安装 Chrome、FFmpeg 和 FFprobe）：

```powershell
node scripts/verify-narration.mjs
```

此脚本启动隔离端口和独立数据目录，仅向本机 MiniMax 协议夹具发送请求，返回测试音，不使用真实密钥、不调用厂商、不产生费用。验证重复请求、缓存复用、失败重试、音频范围请求、旧配音失效及带音轨 MP4。测试音不是 MiniMax 真实配音效果证明。结果和日志位于 `data/narration-verification/`。

测试覆盖时间计算、输入校验、并发版本保护、任务快照、Worker 互斥、配音缓存与模型切换、媒体范围请求及本机来源检查。业务数据测试使用内存 SQLite；媒体和锁测试在 `data/test-runs/` 创建独立文件，不改动真实项目数据。

## 目录

- `src/app/`：页面、项目与导出接口。
- `src/features/`：项目列表和编辑界面。
- `src/shared/`：项目、小节、任务的数据定义。
- `src/video/`：预览与导出共用的教学画面和时间安排。
- `src/server/`：SQLite、文件存储、配音队列、MiniMax 接入和视频导出。
- `src/worker/`：后台任务执行入口。
- `data/`：真实数据库、生成视频和导出清单，不提交 Git。
- `docs/architecture/project-structure.md`：目标目录设计；未实现的目录随功能增加。
- `docs/plans/2026-11-24-progress.md`：本次执行记录与验证情况。
- `docs/plans/2026-11-24-narration.md`：第二阶段范围与验证结果。

## 部署范围

本版本仅绑定本机地址，适合在自己的电脑上使用。未实现用户认证、服务配额或云端文件存储；对外部署前需要补齐这些能力。运行 Web 与 Worker 的机器应使用相同字体，以保证预览与导出的字体一致。

Remotion 的商用许可独立于本项目代码，请按其[官方许可](https://www.remotion.dev/pricing)确认适用条件。
