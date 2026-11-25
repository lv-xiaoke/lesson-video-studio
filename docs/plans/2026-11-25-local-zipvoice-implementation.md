# 本地 ZipVoice 与音色库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 用户授权连续执行，不再逐步确认；在 main 分支实现。

**Goal:** 在现有教学视频工作台中使用可保存的本地参考音色，完成文字配音、试听和视频导出。

**Architecture:** Python 常驻 CPU 引擎独立加载 ZipVoice-Distill INT8；Next.js 管理音色和任务，现有 Worker 串行调用本地引擎，继续使用现有音频资产与导出链路。

**Tech Stack:** Next.js / TypeScript / SQLite / FFmpeg / Python 3.11 / sherpa-onnx。

**Spec:** [设计](2026-11-25-local-zipvoice-design.md)

## Global Constraints

- 默认直接在 main 分支开发、提交并上传到 GitHub；上传前同步检查远端，不强推。
- 禁止批量删除文件或目录；模型、运行环境、录音保存在被忽略的 data 下。
- 不修改用户现有课程或泄露 .env.local 密钥；原腾讯云与 MiniMax 保持兼容。
- 音色参考录音为 3～30 秒，WAV/MP3 最大 10 MB；对应文字必填，最大 1,000 字。
- 本地服务只监听 127.0.0.1，令牌鉴权；不自动回退云端；本地任务串行且最长 15 分钟。

## Review Focus

- 服务切换时旧音色与音频不能混用；项目配置须经过保存、AI 应用及重载保留。
- 停用音色不能提交新任务，但旧队列、生成资产和导出仍有效。
- 上传大小不能只依赖 Content-Length；伪造格式、解码超长和任意路径均须拒绝。
- 任务失败或服务重启不应产生就绪半成品；健康检查不得阻塞页面或返回令牌。
- 长文本切分不得遗漏文字；语速处理后的真实音频时长必须进入导出。

## Task 1: 验证并准备本地引擎

**Files:** `tools/zipvoice/server.py`, `tools/zipvoice/test_server.py`, `tools/zipvoice/requirements.txt`, `scripts/setup-zipvoice.py`, `scripts/start-zipvoice.ps1`。

**Interfaces:** HTTP `GET /health`、`POST /synthesize`；请求含 text/referenceAudio（base64 WAV）/referenceText，返回 WAV；Bearer 令牌从受忽略的本机配置读取。环境含模型路径、线程数与端口。

- [x] 编写 Python 单元测试：无效 token 被拒、非本机绑定禁止、参考音频损坏被拒；运行 `python -m unittest discover -s tools/zipvoice`，预期缺实现失败。
- [x] 核对官方 Windows wheel 支持 ZipVoice，固定版本，隔离安装；下载官方模型及 Vocos，建立 SHA-256 清单。
- [x] 实现严格请求校验、一次加载和串行锁；真实加载后调用 health，并记录启动内存；无授权音色时不将名人演示样本加入用户音色库。
- [x] 运行 Python 测试并提交引擎与脚本；模型和环境不提交。

## Task 2: 项目服务设置、音色和队列

**Files:** `src/shared/{narration,lesson,ai-validation}.ts`, `src/server/voices/{store,process}.ts`, `src/server/narration/store.ts`, `tests/zipvoice.test.ts`。

**Interfaces:** `VoiceStore.create/get/list/rename/archive`；资料内容不可变，ID 与哈希固定；`SpeechJob.referenceHash?` 固定音色内容。`Lesson.speechProvider?` 保留旧数据。

- [x] 先写测试并运行 `node --test tests/zipvoice.test.ts`，检查项目解析保留服务、AI 应用保留设置、无效/停用音色拒绝、改名不使缓存失效、归档后原队列可读取；预期失败。
- [x] 实现本地音色资料与独立试听队列；数据事务保持入队原子性，校验全部小节后再创建任务。
- [x] 显式模型映射与本地音色校验，缓存按模型、音色身份和文本/语速匹配，兼容历史云端模型。
- [x] 运行 `npm test`，预期全绿，再提交。

## Task 3: 音频处理、适配器和 API

**Files:** `src/server/providers/tts/zipvoice.ts`, `src/server/voices/audio.ts`, `src/app/api/voices/**/route.ts`, `src/app/api/tts/config/route.ts`, `src/app/api/projects/[projectId]/{narrations,exports}/route.ts`, `src/worker/index.ts`, `src/server/http.ts`。

**Interfaces:** `speechConfig(provider?)` 返回公开配置；`synthesizeZipVoice(job)` 返回真实 WAV 与时长；上传 API 接受 multipart name/referenceText/audio；试听 API 创建任务并轮询。

- [x] 添加测试：分句保留完整文字、200 字边界、故障/超时不返回资产；真实 FFmpeg 校验非法音频、超长录音、0.5/2 倍语速输出时长；运行看预期失败。
- [x] 实现有界请求体读取、解码校验、mono 24k PCM 标准化；引擎适配器发送字节，不接受客户端路径；长文本逐段生成、FFmpeg 合并并变速。
- [x] 加入同源 API、试听进度/音频读取及 Worker 串行处理；保持云端生成与导出使用所选项目服务。
- [x] 运行 `npm test` 与 `npm run typecheck`，预期全绿，再提交。

## Task 4: 网页音色库和项目切换

**Files:** `src/features/editor/{Editor,NarrationPanel,VoiceLibrary}.tsx`, `src/features/editor/editor.css`, `src/shared/editor-workflow.ts`。

**Interfaces:** 当前项目 provider 决定配置和声音选项；音色面板上传/改名/停用/试听后刷新列表；应用全部小节复用 VoiceSettings。

- [x] 为服务切换和配音状态增加测试：其他引擎音频不算就绪、失效音色不自动替换；运行看预期失败。
- [x] 实现服务选择、健康状态、音色管理表单与试听进度、应用全部小节；保持键盘和移动端可用，避免未保存时误提交。
- [x] 运行 `npm test`、`npm run typecheck`，预期全绿，再提交。

## Task 5: 集成验证、启动、文档和上传

**Files:** `scripts/verify-zipvoice.mjs`, `README.md`, `docs/操作指南.md`, 本实施计划。

- [x] 协议测试使用独立 DATA_DIR 验证上传两音色、队列、试听、停用和 MP4 有声导出；模型实测与协议模拟分开报告。
- [x] 无用户录音时，用清楚标记的合成测试参考做技术连通性验证，不伪称真人克隆音质已验收；保留正常上传入口供用户录音验收。
- [x] 空队列时停止本任务管理的旧服务，运行 `npm run build`；重启网页、Worker、本地服务并核对健康。
- [x] 使用真实网页核对流程，更新操作指南记录初始化和已测性能；通过最终独立代码审查，修复重要问题，重新跑检查。
- [x] 检查密钥与 git diff，提交全部本次修改；fetch 后 push main，核对远端提交。

## 执行记录

用户已明确授权「不用再问，直到完成升级」。按本计划连续执行；若官方运行包不支持目标模型，先调查可验证的替代版本并记录，不将不可用引擎伪装为已配置。
