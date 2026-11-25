# 视频音色导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 用户已授权不重复确认，当前 main 顺序实施，完成后一次独立审查。

**Goal:** 独立音色库支持视频片段提取、离线自动转写和确认后保存。

**Architecture:** 复用 Python sherpa-onnx 增加 SenseVoice；Next.js 流式接收文件并入 SQLite，单 Worker 提取及识别；独立页面管理任务草稿和所有音色。

**Tech Stack:** Next.js、SQLite、FFmpeg、Python 3.11、sherpa-onnx 2.0.3。

**Spec:** [设计](2026-11-25-video-voice-import-design.md)。

## Global Constraints

- 不批量删除；不覆盖用户课程、密钥或个人资料；默认 main 开发并上传，保留远端修改。
- 参考片段 3～30 秒，源媒体最多 200 MB；上传必须流式按实际字节限额。
- 识别在本地，无新增厂商调用；识别异常不影响已有音色和 TTS。
- 提取结果先供试听/校对，保存幂等，参考资料不可变；推理串行且有进程级截止时间。

## Review Focus

- 片段起止和识别文字必须对应，长视频不能被无声截断后误认为完整转写。
- 允许格式必须与解复用器对应，拒绝无音轨、静音、损坏文件和路径/网络注入。
- 大文件流式限额和中断上传不得留出可运行的坏任务；只在完整上传后入队。
- 重载、切换导入记录或离开页面后结果可找回，保存不会重复创建音色。
- 识别模型缺失、超时和重启时 TTS 及历史资料可继续使用。

## Task 1: 本地识别引擎

**Files:** `tools/zipvoice/asr.py`, `tools/zipvoice/test_server.py`, `tools/zipvoice/server.py`, `scripts/setup-zipvoice.py`, `tools/zipvoice/model-checksums.json`。

**Interfaces:** `load_recognizer(model_dir)` 与 `transcribe(recognizer, pcm, sample_rate)`；HTTP `/transcribe` 请求 `{audio: base64Wav, timeoutSeconds}`，返回 `{text}`。

- [x] 先添加无效 WAV、静音、长度及识别控制标签清理测试，运行 `python -m unittest discover -s tools/zipvoice` 看缺功能失败。
- [x] 固定官方 SenseVoice INT8 模型及校验值，扩展安装器安全提取；不装额外框架。
- [x] 增加独立加载容错、健康状态、鉴权与超时识别端点，真实合成参考的识别测试记录耗时。
- [x] Python 测试通过并提交。

## Task 2: 导入资料与提取队列

**Files:** `src/shared/voice-import.ts`, `src/server/voices/{imports,extract,transcribe}.ts`, `src/worker/index.ts`, `tests/voice-import.test.ts`。

**Interfaces:** `VoiceImportStore.create/list/get/claim/complete/fail/save/recoverInterrupted`；`extractReference(path,start,duration)`；`processVoiceImport(job,store)`。

- [x] 测试区间校验、队列互斥、失败重启、识别与确认分离、幂等保存。测试生成的 MP4 提取实际时长、越界、无音轨和伪装扩展名，先运行看预期失败。
- [x] 实现不可变媒体任务与事务保存，FFmpeg 固定解复用器、限定协议及超时，输出标准 WAV 并拒绝无声片段；适配器调用本地识别，过滤无效结果。
- [x] Worker 串行接入导入任务，保留 TTS/导出流程；运行 `npm test` 和 `npm run typecheck`，预期通过并提交。

## Task 3: 流式上传与音色库 API

**Files:** `src/app/api/voice-imports/**/route.ts`, `src/server/voices/upload.ts`, `tests/voice-upload.test.ts`。

**Interfaces:** 原始文件请求体流式写入随机目录；元数据只用于展示及时间范围，不接收路径；公开接口剥离内部路径。

- [x] 先测实际字节超限、空文件、未知扩展、上传中断、JSON 保存超限及重复保存。
- [x] 实现同源 API、流式限制、查询任务、试听片段和保存；返回错误不泄露本机服务配置。
- [x] 跑全测试、类型检查，预期通过并提交。

## Task 4: 独立页面与编辑器入口

**Files:** `src/app/voices/page.tsx`, `src/features/voices/{VoiceManager,VoiceCollection,MediaImport}.tsx`, `src/features/voices/voices.css`, `src/features/editor/VoiceLibrary.tsx`, `src/features/projects/ProjectList.tsx`, `src/features/editor/Editor.tsx`。

- [x] 按现有视觉体系设计独立页面：左侧导入并选择片段，中间显示提取/识别/校对，右侧管理已有音色；窄屏顺序排列。
- [x] 接入媒体本地预览、时间选择、异步任务恢复、音频试听、文本校对、显式保存；允许改名/停用/合成试听。
- [x] 编辑器改为打开独立音色库并刷新选择列表，返回页面焦点时自动刷新；原课程草稿不丢失。
- [x] 跑测试、类型检查和构建，真实页面检查流程。

## Task 5: 验证、审查和交付

**Files:** `scripts/verify-voice-import.mjs`, `README.md`, `docs/操作指南.md`, 本计划及进度记录。

- [x] 独立 DATA_DIR 和自有临时端口，生成带声视频，验证提取/识别/校对/保存/复用/无音轨失败；真实模型与协议验证区分报告。
- [x] 独立最终审查，重要问题用回归测试修复，运行全部测试、类型检查和构建。
- [x] 队列空闲时核对身份并重启所属服务，确认正式页面与识别健康，更新操作指南及性能记录。
- [x] 扫描密钥、fetch 核对 main，提交并上传，保留用户未提交文档。
