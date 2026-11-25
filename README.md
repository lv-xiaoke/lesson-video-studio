# 知帧 · AI 教学视频工作台

使用 Next.js、React 与 Remotion，将教学内容组织成小节，在网页中编辑、保存、预览并提交后台制作视频。

当前支持本地单人制作：DeepSeek 生成课程草稿或改写单节 → 人工预览并应用 → 选择腾讯云、MiniMax 或本地 ZipVoice 配音 → 按实际音频时长预览 → 导出带配音 MP4。ZipVoice 支持上传参考录音和对应文字，保存并复用多个音色，无配音 API 费用。支持小节管理与五种画面模板，写稿、配音、导出分别手动触发。

日常制作视频请看 [当前版本操作指南](docs/操作指南.md)，包含从创建项目到导出 MP4 的步骤、服务启动方法及常见问题。功能或操作变化时，同步维护这份指南。

编辑器按「生成草稿 → 编辑确认 → 生成配音 → 预览导出」四步组织。默认直接显示视频预览；右侧用「讲解 / 画面 / 声音」标签编辑，小节列表显示配音状态。批量配音位于「生成配音」步骤，导出前会列出缺失配音的小节并提供补齐入口。

## 环境与安装

- Node.js 24 或以上（本项目使用内置 SQLite 和 TypeScript 类型擦除）。
- npm。
- 首次导出需要下载 Chromium 与相关渲染工具，或配置可用的 Chrome / Chromium。

```powershell
npm install
Copy-Item .env.example .env.local
```

真实配置不要提交 Git。默认数据放在项目根目录 `data/`，可通过 `DATA_DIR` 修改。Web 和 Worker 必须在同一项目根目录运行，并使用同一份配置。

### 配置 DeepSeek 写稿（可选）

在已有 `.env.local` 中填写以下配置，不要覆盖原有腾讯云配置：

```dotenv
DEEPSEEK_API_KEY=你的本机密钥
DEEPSEEK_MODEL=deepseek-flash
```

重启 Web 和 Worker 后，在「AI 备课助手」填写主题、学习对象和期望时长，生成草稿。期望时长是写稿参考值，最终视频以实际配音为准。生成一次只请求一次模型，不自动重试；调用会消耗 DeepSeek 额度。生成结果先保存在任务中，需人工审核后应用，不会自动配音或导出。

可生成整份课程或改写选中小节，并通过「查看草稿记录」切换历史结果。应用前校验课程版本，避免覆盖后续编辑；没有后续修改时可撤销最近一次应用。密钥只在服务器使用，不返回浏览器。2026 年 11 月 25 日已通过一次真实 DeepSeek 整课生成测试：`deepseek-flash` 约 4.5 秒返回四节有效草稿；未自动应用或生成配音。生成内容仍需人工审核。

### 配置腾讯云（默认）

1. 在[语音合成控制台](https://console.cloud.tencent.com/tts)开通服务，领取基础/精品音色免费资源包，并在「语音合成设置」确认后付费关闭。免费资源包有有效期，实际剩余额度以控制台为准。
2. 创建专用于项目的子用户，开启编程访问并关联 `QcloudTTSFullAccess`，保存子用户的 `SecretId` 和 `SecretKey`。
3. 已有 `.env.local` 时只追加缺失配置；同名项直接修改，避免重复。不要覆盖原有数据目录等配置：

```dotenv
TTS_PROVIDER=tencent
TENCENT_SECRET_ID=你的SecretId
TENCENT_SECRET_KEY=你的SecretKey
```

4. 重启 Web 和 Worker。编辑器会显示「腾讯云精品音色」，默认智瑜（`101001`），也可选择智云、智燕、智瑞。
5. 先生成一小节试听，再生成其余配音，最后导出带配音 MP4。

密钥仅放在本机 `.env.local`，不要写进网页、源码、聊天或 Git。客户端只知道配置是否齐全，不会收到密钥。

本项目使用通用语音合成下的 `TextToVoice` 基础接口，不使用不适用该免费资源包的长文本接口。每段最多 150 个 UTF-16 单元及 450 字节，优先按句末标点分段；依次请求 16 kHz 单声道 16-bit PCM，拼接后封装为 WAV，通过采样数计算真实时长。语速按厂商公开档位近似换算。合成任一分段失败后停止后续请求，不自动重试；此前完成的分段可能已经扣减额度，手动重试会重新请求整节。

在网页「声音 → 配音服务」中按项目切换服务，切换后重新选择音色。各服务音频缓存分别匹配，已有任务继续使用入队时的引擎。未单独设置的旧项目沿用 `TTS_PROVIDER`，保留旧版默认音色兼容行为。

正式接口依据：[腾讯云基础语音合成](https://cloud.tencent.com/document/api/1073/37995)、[腾讯云音色列表](https://cloud.tencent.com/document/product/1073/92668)。免费额度用量与有效期由腾讯云管理，应用不声称已同步余额，也不会替你开启后付费。

### 配置 MiniMax（可选）

已有 `.env.local` 时，只追加下面的配置，不要覆盖已有内容：

```dotenv
TTS_PROVIDER=minimax
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

### 本地 ZipVoice 和音色库（可选）

Windows x64、Python 3.11、Node.js 24+ 和 FFmpeg。首次在项目目录执行：

```powershell
python scripts/setup-zipvoice.py
```

安装到当前 `DATA_DIR/zipvoice/`，不会修改原 Python 环境。固定 sherpa-onnx / core 2.0.3 和 NumPy 2.2.6；下载 ZipVoice-Distill INT8、Vocos 及词典，按提交的 SHA-256 清单核对。首次需要联网，之后推理在本机完成。录音、模型、运行环境及本机服务令牌均不提交 Git。

日常启动已构建的工作台、Worker 和本地引擎：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local-services.ps1
```

只启动本地引擎可使用 `scripts/start-zipvoice.ps1`。服务监听回环地址，使用本机生成的令牌；网页只访问 Next.js。`ZIPVOICE_THREADS` 可在启动脚本前设置，默认 4 线程。脚本与 Web/Worker 使用同一个环境变量或 `.env.local` 中的 `DATA_DIR`。

首页和编辑器的「音色库」进入独立 `/voices` 页面。支持最大 200 MB 的 MP4/MOV/M4V/WebM/MKV/WAV/MP3，选取 3～30 秒参考片段；FFmpeg 提取声音，SenseVoice INT8 在本机识别，听音频并校对文字后保存音色。也可用手动表单上传最大 10 MB 的 WAV/MP3 和准确原文。课程中仍选择音色并应用到全部小节，返回页面时自动刷新列表。

识别模型复用 sherpa-onnx，额外下载约 163 MB。旧安装运行 `python scripts/setup-zipvoice.py` 补充模型，队列空闲时运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-zipvoice.ps1 -Restart`。已有配音服务及密钥不变；ASR 模型异常会自动降级保留 TTS。音色保存的是参考录音与文字，不为每人重新训练。原录音不可覆盖，需更换时新建音色；停用保留历史资料。没有内置真人参考录音。

导入任务在 Worker 中串行执行，可重载页面找回；识别草稿不会自动生成音色，保存使用事务确保幂等。原文件流式接收，失败且未入队时只清理本次确切文件；已入队的失败记录及资料保留供排查，不进行批量删除。支持无时长元数据的流式 WebM/MKV，以实际音轨采样数检查选区完整性。推理只有本地调用，不发送到第三方服务。

完整验证：`node scripts/verify-voice-import.mjs` 使用独立数据与端口的协议夹具，覆盖满队列拒绝、提取、校对保存、复用及带声 MP4；设置 `VERIFY_IMPORT_REAL=1` 时使用实际 SenseVoice/ZipVoice，并可通过第一个命令行参数提供明确的测试参考录音（默认使用先前的合成测试参考）。本机 6 秒视频提取及识别约 1.3 秒；识别准确率不作保证，需要人工校对。

实测（2026-11-25，i9-14900HX，31.7 GB RAM，CPU 4 线程）：初次加载约 3 秒；101 字中文首次约 39 秒、热生成约 35 秒，输出约 18 秒；模型进程生成后工作集约 791 MB。模型包、声码器和额外英文词典下载约 170 MB，安装展开及 Python 环境还会额外占用磁盘。用系统合成参考音完成真实引擎及有声 MP4 测试；真人相似度、自然度和两位说话人区分度需要上传实际录音试听，不能由协议测试证明。

单任务最多 15 分钟，推理超时会终止模型子进程并重新加载，当前任务失败后需手动重试，不自动转到云端。

验证：`node scripts/verify-zipvoice.mjs` 使用独立端口和数据目录的协议夹具，保留带音轨 MP4；`scripts/verify-zipvoice-engine.mjs <录音绝对路径> <准确原文>` 测真实模型。后者只接受明确提供的参考录音，不自动使用模型演示录音。

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

提交写稿、配音或导出任务后可关闭网页，Worker 会继续工作；完成后重新打开项目查看。一次仅启动一个 Worker。修改视频组件代码后需要重启 Worker，以刷新打包缓存。

可选的 Remotion 开发界面：

```powershell
npm run studio
```

## 使用示例

1. 在首页创建一个项目，系统载入三小节二分查找示例。
2. 可先使用「AI 备课助手」生成整课草稿，审核后应用；也可直接手动编辑。支持增删、复制、排序小节，或选中一节生成改写草稿。
3. 保存项目。刷新页面后，内容从 SQLite 恢复。
4. 启动 Worker，按节生成配音或批量补齐。配音操作会先保存当前草稿。
5. 完成后单节试听。勾选“预览与导出使用配音”，画面按实际音频时长加 0.35 秒结尾停顿计算，最短为 3 秒。
6. 点击“导出带配音视频”；需要每一节都有与当前文字、音色、语速和配置模型匹配的配音。取消勾选可导出无声版本。
7. 完成后下载 MP4；导出固定提交时的内容与音频资产，之后仍可继续编辑。

数组演示画面目前是固定的二分查找示例。AI 自动生成使用标题、总结、步骤、对比四种通用模板，不生成任意 HTML 或执行生成代码。步骤模板每行一个步骤，最多五行；对比模板分别填写两侧标题与要点，最多各四条。长讲解保留全文用于配音，画面底部只展示有限行数。

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

AI 生命周期和新模板验收：

```powershell
node scripts/verify-ai.mjs
node scripts/verify-visuals.mjs
```

前者在独立端口和数据目录验证整课/单节生成、版本保护、幂等应用与撤销、HTTP 错误及真实 120 秒超时、配音复用、音频范围请求和带音轨 MP4。只请求本机夹具，不使用真实密钥。后者生成步骤/对比普通及最大文字、三秒总结八要点、标题/总结长文字共七张截图，供人工检查；产物保存在 `data/visual-verification/`。两种脚本均保留数据，不清理目录。

此脚本启动隔离端口和独立数据目录，默认验证 MiniMax；验证腾讯云时设置 `$env:VERIFY_TTS_PROVIDER='tencent'` 后运行相同命令。它仅向本机协议夹具发送请求，返回测试音，不使用真实密钥、不调用厂商、不产生费用。验证重复请求、缓存复用、失败重试、音频范围请求、旧配音失效及带音轨 MP4；腾讯云还验证长讲解分段和 WAV 试听下载。测试音不是厂商真实配音效果证明。结果和日志位于 `data/narration-verification/`。

测试覆盖时间计算、输入校验、并发版本保护、任务快照、Worker 互斥、配音缓存与模型切换、媒体范围请求及本机来源检查。业务数据测试使用内存 SQLite；媒体和锁测试在 `data/test-runs/` 创建独立文件，不改动真实项目数据。

## 目录

- `src/app/`：页面、项目与导出接口。
- `src/features/`：项目列表和编辑界面。
- `src/shared/`：项目、小节、任务的数据定义。
- `src/video/`：预览与导出共用的教学画面和时间安排。
- `src/server/`：SQLite、文件存储、配音队列、腾讯云 / MiniMax 接入和视频导出。
- `src/worker/`：后台任务执行入口。
- `data/`：真实数据库、生成视频和导出清单，不提交 Git。
- `docs/architecture/project-structure.md`：目标目录设计；未实现的目录随功能增加。
- `docs/plans/2026-11-24-progress.md`：本次执行记录与验证情况。
- `docs/plans/2026-11-24-narration.md`：第二阶段范围与验证结果。

## 部署范围

本版本仅绑定本机地址，适合在自己的电脑上使用。未实现用户认证、服务配额或云端文件存储；对外部署前需要补齐这些能力。运行 Web 与 Worker 的机器应使用相同字体，以保证预览与导出的字体一致。

Remotion 的商用许可独立于本项目代码，请按其[官方许可](https://www.remotion.dev/pricing)确认适用条件。
