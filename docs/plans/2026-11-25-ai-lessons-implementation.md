# 第三阶段 DeepSeek 教学草稿实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 输入主题生成可审阅的课程草稿，支持单节改写、小节管理及两种新画面，确认后使用已有配音和视频导出功能。

**Architecture:** 沿用 Next.js、SQLite 和单 Worker。AI 任务独立于课程保存，应用与撤销通过项目版本保护。模型只输出教学数据，Remotion 负责预览和导出。

**Tech Stack:** Node.js 24+、TypeScript、Next.js 16、React 19、Remotion 4、node:sqlite、原生 fetch；保留当前锁文件中的确切版本。

**Spec:** [已确认的第三阶段设计](2026-11-24-ai-lesson-design.md)。

状态：五项实现及本机模拟验收完成，独立代码审查进行中。

## 交付顺序

| 顺序 | 完成后能做什么 |
| --- | --- |
| 1 | 新增、复制、删除小节，使用步骤讲解和左右对比画面 |
| 2 | 服务端调用 DeepSeek，并检查生成结果是否符合教学数据格式 |
| 3 | 独立保存草稿，支持应用、放弃、撤销及版本冲突保护 |
| 4 | 在网页输入主题生成课程，或提出要求改写一节 |
| 5 | 走通完整流程，查阅更新后的操作指南 |

没有 DeepSeek 密钥时，第 1 项和原有手动制作仍可使用，AI 按钮显示配置说明。真实调用需要本机密钥与可用账号额度，模拟验收不调用外部服务。

## Global Constraints

- 沿用 Node.js、Next.js、SQLite 和现有单 Worker，不新增数据库或大型运行依赖。
- 小节数量保持 1～20 个。原有项目和三种画面模板继续兼容。
- AI 选择标题、总结、步骤、对比模板，不生成固定的二分查找数组演示，也不执行模型生成的 HTML 或 React 代码。
- 密钥通过 .env.local 的 DEEPSEEK_API_KEY 提供，只由服务端读取。
- AI 结果先作为独立草稿保存，不自动覆盖当前课程。AI 不自动调用配音或导出。
- 一次主动生成只提交一次模型请求，不自动重试。
- 应用草稿前检查项目版本。撤销仅在课程没有后续保存时生效，撤销生成新版本。
- 删除小节仅修改当前课程，已有音频文件保留。
- 禁止批量或递归删除文件及目录；验收产物保留在 Git 忽略的数据目录中。
- 保留用户已有文档、README 改动、本机配置及项目数据，不作为测试数据覆盖。
- 构建前确认本项目运行队列空闲并停止旧服务，或使用独立验收副本；不在运行服务读取同一 .next 时改写构建产物。

## Review Focus

1. 生成期间编辑、删节或另一标签页保存：旧结果可查看，不能覆盖新内容。任务 3 和 5 覆盖。
2. 合法 JSON 中夹带未知类型、超长文字、伪造 ID 或音色：校验和字段白名单阻止异常修改。任务 2 覆盖。
3. 超时、后台重启、重复点击和重复应用：不重复模型调用，不重复提升项目版本。任务 2、3 和 5 覆盖。
4. 复制或删除当前小节：选中项、音轨和时间线不越界；旧导出仍使用原快照。任务 1、4 和 5 覆盖。
5. 最大文本的画面布局、长任务期间的编辑体验及日志脱敏：任务 5 用截图、浏览器和凭据扫描核查。

## 共享约定

### 新画面

在 src/shared/scene.ts 中增加以下类型，旧字段含义保持不变：

~~~typescript
export type SceneKind = 'title' | 'array' | 'summary' | 'steps' | 'comparison';
export type ComparisonContent = {
  leftTitle: string; leftPoints: string[];
  rightTitle: string; rightPoints: string[];
};
// 现有 Scene 增加 comparison?: ComparisonContent。
~~~

步骤存于 content，一行一步，1～5 行，每行最多 80 字。对比画面的左右标题各 1～30 字，要点各 1～4 条、每条 1～60 字；comparison 类型必须提供这些字段，content 保存该节画面概述。

旧模板保持原服务端长度限制。AI 新生成的小节标题最多 60 字，content 和 narration 各最多 500 字。底部讲解显示超出区域时限制显示行数，完整讲解仍用于配音，不截断保存内容。

新增及复制使用全局 crypto.randomUUID 分配新 ID；单节 AI 改写保留原 ID 与 voice。

### AI 数据

任务 2 创建 src/shared/ai.ts，其他任务消费同一接口：

~~~typescript
import type { Lesson } from './lesson.ts';
export type AiInput =
  | { kind: 'lesson'; topic: string; audience: string; targetSeconds: number }
  | { kind: 'scene'; sceneId: string; instruction: string };
export type AiConfig = { provider: 'deepseek'; configured: boolean; model: string };
export type AiUsage = { promptTokens: number; completionTokens: number };
export type AiStatus =
  | 'queued' | 'running' | 'succeeded' | 'failed'
  | 'applied' | 'undone' | 'discarded';
export type AiJob = {
  id: string; projectId: string; baseVersion: number;
  model: string; input: AiInput; sourceLesson: Lesson;
  status: AiStatus; result: Lesson | null; error: string | null;
  usage: AiUsage | null; appliedVersion: number | null;
  undoneVersion: number | null; createdAt: string;
};
~~~

topic 为 1～200 字，audience 为 1～80 字，targetSeconds 为 30～600 的整数；instruction 为 1～1000 字，sceneId 必须存在于源课程。期望时长用于规划，成片时长依实际配音确定。

模型整课结果格式为含 title、scenes 的对象；单节结果为含 scene 的对象。服务端统一将结果归一化为完整 Lesson；单节改写仅替换源课程中对应一节。

### HTTP

| 接口 | 请求或响应 |
| --- | --- |
| GET /api/ai/config | AiConfig，不返回密钥或请求头 |
| GET /api/projects/:projectId/ai | 该项目的 AiJob 数组，新到旧排列 |
| POST /api/projects/:projectId/ai | 请求 version、input，返回任务及 HTTP 202 |
| POST /api/projects/:projectId/ai/:jobId | 请求 action、version；action 为 apply、undo、discard，返回 job、project |

路由使用 Node runtime、动态响应及现有 localMutation/errorResponse。跨项目任务返回 404；版本冲突返回 409；输入或状态错误返回 400。未配置模型密钥时不得创建外部调用任务。

## Task 1 小节管理与两种画面

**Files:** 修改 src/shared/scene.ts、src/shared/lesson.ts、src/features/editor/Editor.tsx、src/app/globals.css、src/video/scenes/TeachingScene.tsx。新增 src/shared/scene-actions.ts、src/features/editor/SceneActions.tsx、src/features/editor/ComparisonFields.tsx、src/video/scenes/StepsVisual.tsx、src/video/scenes/ComparisonVisual.tsx、tests/scene-actions.test.ts。

**Interfaces:** 提供以下不可变操作，失败时抛出错误，不修改输入课程。

~~~typescript
export function appendScene(lesson: Lesson, kind?: SceneKind): Lesson;
export function duplicateScene(lesson: Lesson, sceneId: string): Lesson;
export function removeScene(lesson: Lesson, sceneId: string): Lesson;
export function changeSceneKind(scene: Scene, kind: SceneKind): Scene;
~~~

- [x] Step 1 写失败测试，先验证新模板可以保存，再验证复制身份及最少小节限制。

~~~typescript
test('copy uses an independent identity without mutating the original', () => {
  const lesson = createExampleLesson();
  const result = duplicateScene(lesson, lesson.scenes[0].id);
  assert.equal(lesson.scenes.length, 3);
  assert.equal(result.scenes.length, 4);
  assert.equal(result.scenes[1].narration, lesson.scenes[0].narration);
  assert.notEqual(result.scenes[1].id, lesson.scenes[0].id);
});
test('cannot remove the last remaining scene', () => {
  const lesson = createExampleLesson();
  lesson.scenes = lesson.scenes.slice(0, 1);
  assert.throws(() => removeScene(lesson, lesson.scenes[0].id), /至少|最后/);
});
~~~

另测 steps 和 comparison 保存读取、非法模板字段、20 节时新增和复制被阻止、缺失 ID、复制对比内容后修改副本不影响原节，以及旧三模板兼容。

- [x] Step 2 运行 node --test tests/scene-actions.test.ts。Expected: 新模板或小节管理行为缺失导致失败。
- [x] Step 3 实现纯函数、字段校验及画面。新增小节提供可编辑默认值；切换 comparison 补齐默认左右内容；动画由视频帧决定。
- [x] Step 4 接入新增、复制、删除及对比输入框。删除后选中有效相邻节，新增及复制后选中新节，操作前暂停播放器。
- [x] Step 5 运行 npm test 与 npm run typecheck。Expected: 原有 29 项及新测试通过；新模板保存刷新正常。
- [x] Step 6 只暂存本任务 Files 中的源码与测试，再提交：

~~~powershell
git commit -m 'feat: add editable lesson scenes and teaching templates'
~~~

## Task 2 DeepSeek 接口与结果校验

**Files:** 新增 src/shared/ai.ts、src/shared/ai-validation.ts、src/server/providers/llm/deepseek.ts、src/server/ai/prompts.ts、src/app/api/ai/config/route.ts、tests/ai-provider.test.ts。修改 .env.example；只在本机配置中追加缺失空项。

**Interfaces:**

~~~typescript
export function parseAiInput(raw: unknown): AiInput;
export function normalizeAiResult(raw: unknown, input: AiInput, source: Lesson): Lesson;
export function aiConfig(): AiConfig;
export function draftMessages(job: AiJob): { role: 'system' | 'user'; content: string }[];
export async function generateDraft(
  job: AiJob, options?: { fetcher?: typeof fetch }
): Promise<{ lesson: Lesson; usage: AiUsage | null }>;
~~~

配置使用 DEEPSEEK_API_KEY 和 DEEPSEEK_MODEL，默认模型沿用已确认设计的 deepseek-flash。DEEPSEEK_API_ENDPOINT 默认是 https://api.deepseek.com/chat/completions，仅允许官方地址或本机 HTTP 的 /chat/completions 作为验收覆盖点；拒绝其他域名及含用户信息、查询参数或 fragment 的地址。

- [x] Step 1 写格式与身份保护测试，并用受控 fetcher 验证唯一一次请求。

~~~typescript
test('rewrite cannot change scene identity, voice or other scenes', () => {
  const source = createExampleLesson();
  source.scenes[0].voice = { voiceId: '101001', speed: 1.2 };
  const input: AiInput = { kind: 'scene', sceneId: 'intro', instruction: '讲简单一些' };
  const result = normalizeAiResult({ scene: {
    id: 'injected', voice: { voiceId: '402000', speed: 2 },
    kind: 'title', title: '简单例子', content: '先看例子',
    narration: '我们先看一个简单例子。', durationSeconds: 8
  } }, input, source);
  assert.equal(result.scenes[0].id, 'intro');
  assert.deepEqual(result.scenes[0].voice, source.scenes[0].voice);
  assert.deepEqual(result.scenes.slice(1), source.scenes.slice(1));
  assert.equal(result.title, source.title);
});
~~~

还需覆盖：空响应、finish_reason=length、错误 JSON、缺字段、超长讲解、错误对比字段、不支持的 kind、空 usage、HTTP 401/402/429/500、超时、非法接入地址、公开配置和错误信息不含虚拟密钥。错误和超时均断言只请求一次。

- [x] Step 2 运行 node --test tests/ai-provider.test.ts。Expected: 接口或校验尚未实现，测试失败。
- [x] Step 3 实现配置、提示和一次请求。系统提示明确 json 及示例格式；用户内容仅作为 user 消息数据。基本请求如下：

~~~typescript
const payload = {
  model: job.model,
  messages: draftMessages(job),
  response_format: { type: 'json_object' },
  max_tokens: 8192,
  stream: false
};
~~~

请求使用 Bearer 鉴权、120 秒超时和 redirect='error'，明确设置 thinking 为 { type: 'disabled' }。检查 HTTP、finish_reason 及非空 content 后解析结果；模型不可写 ID、voice 和其他节。不打印完整响应或异常对象。排队后配置模型改变时拒绝静默切换模型，提示重新提交。

- [x] Step 4 运行 npm test 与 npm run typecheck。Expected: 全部通过；无密钥时 configured=false，不进行真实外部调用。
- [x] Step 5 只暂存本任务 Files 中的源码、测试和空模板，再提交：

~~~powershell
git commit -m 'feat: integrate DeepSeek structured lesson drafting'
~~~

## Task 3 AI 任务持久化及应用撤销

**Files:** 新增 src/server/ai/store.ts、src/server/ai/process.ts、tests/ai-store.test.ts、src/app/api/projects/[projectId]/ai/route.ts、src/app/api/projects/[projectId]/ai/[jobId]/route.ts、scripts/verify-ai.mjs；修改 src/worker/index.ts。

**Interfaces:** AiStore 的构造参数为 ProjectStore，公开方法如下。processAiJob 消费 generateDraft，完成后保存任务结果。

~~~typescript
export declare class AiStore {
constructor(projects: ProjectStore);
list(projectId: string): AiJob[];
job(projectId: string, id: string): AiJob | undefined;
enqueue(projectId: string, version: number, input: AiInput, model: string): AiJob;
claim(): AiJob | undefined;
complete(id: string, result: { lesson: Lesson; usage: AiUsage | null }): AiJob;
fail(id: string, error: string): void;
recoverInterrupted(): void;
apply(projectId: string, id: string, version: number): { job: AiJob; project: Project };
undo(projectId: string, id: string, version: number): { job: AiJob; project: Project };
discard(projectId: string, id: string): { job: AiJob; project: Project };
}
export async function processAiJob(
  job: AiJob, store: AiStore, provider?: typeof generateDraft
): Promise<AiJob>;
~~~

新表 ai_jobs 至少保存 id、project_id、status、payload，建立项目索引。list 包含全部 active 任务及最近 50 个终态任务。原项目表和任务不清空。

enqueue 在事务中验证版本及单节存在性；同项目、版本、model、归一化 input 的 queued/running 任务去重。claim 事务领取一次。状态为 queued → running → succeeded/failed；成功结果可 applied/discarded，失败结果可 discarded，应用后可 undone。中断任务恢复为 failed，不重新入队。

apply 仅允许 succeeded 且当前版本为 baseVersion；undo 仅允许 applied 且当前版本为 appliedVersion。项目保存和任务状态更新在同一事务内。重复 apply/undo 且对应结果版本仍为当前版本时返回既有结果，不重复提升版本；后续编辑后返回冲突。

- [x] Step 1 写事务失败测试，并创建完整 HTTP 验收脚本，先记录缺少 AI 路由时的失败。最小冲突测试：

~~~typescript
test('old AI result never overwrites a newer saved project', () => {
  const projects = new ProjectStore(':memory:');
  const ai = new AiStore(projects);
  try {
    const p = projects.create('原课程');
    const job = ai.enqueue(p.id, 1, {
      kind: 'lesson', topic: '缓存', audience: '初学者', targetSeconds: 60
    }, 'deepseek-flash');
    ai.claim();
    ai.complete(job.id, { lesson: createExampleLesson('AI 草稿'), usage: null });
    const next = structuredClone(p.lesson);
    next.title = '用户新编辑';
    projects.save(p.id, next, 1);
    assert.throws(() => ai.apply(p.id, job.id, 2), /版本|修改/);
    assert.equal(projects.get(p.id)?.lesson.title, '用户新编辑');
    assert.equal(ai.job(p.id, job.id)?.status, 'succeeded');
  } finally { projects.close(); }
});
~~~

另测并发领取、重复入队、缺失小节、跨项目访问、完成不自动更新课程、事务回滚、重复应用、撤销递增版本、重复撤销、应用后编辑阻止撤销、放弃不修改课程、恢复中断及超出 50 条历史后的 active 去重。

- [x] Step 2 运行 node --test tests/ai-store.test.ts。Expected: 任务或版本规则尚未实现，测试失败。
- [x] Step 3 实现存储、处理函数与路由。边界使用 parseAiInput、整数 version、配置检查及 localMutation；AI 过程不增加配音或导出任务。
- [x] Step 4 接入单 Worker，每轮至多处理各一项配音、AI、导出；无任务时休眠，AI 异常标记失败后继续其余任务，启动时恢复中断状态。
- [x] Step 5 运行 npm test 与 npm run typecheck。Expected: 全部通过，不破坏旧任务。
- [x] Step 6 只暂存本任务 Files 中的文件，再提交：

~~~powershell
git commit -m 'feat: persist AI drafts with guarded apply and undo'
~~~

## Task 4 网页 AI 备课与单节改写

**Files:** 新增 src/features/editor/AiPanel.tsx、src/features/editor/AiDraftPreview.tsx、src/features/editor/api.ts、src/shared/ai-editor.ts、tests/ai-editor.test.ts；修改 src/features/editor/Editor.tsx、src/features/projects/ProjectList.tsx、src/app/globals.css。

**Interfaces:**

~~~typescript
export type AiPanelProps = {
  project: Project; sceneId: string; dirty: boolean; busy: boolean;
  prepareProject: () => Promise<Project>;
  onApplied: (project: Project) => void;
};
export function draftActionState(
  job: AiJob, projectVersion: number, dirty: boolean
): { canApply: boolean; canUndo: boolean; reason: string | null };
~~~

prepareProject 保存必要的编辑并返回服务器版本；保存失败不提交生成。onApplied 暂停播放器、更新已保存项目与草稿、选择有效小节并刷新配音状态。应用旧草稿前不能以自动保存掩盖版本冲突。

src/features/editor/api.ts 提取现有编辑器中的通用请求函数，导出 request<T>(url: string, init?: RequestInit): Promise<T>，保留现有 HTTP 错误转用户提示的行为，Editor 与 AiPanel 共用。

- [x] Step 1 写动作状态失败测试。固定 succeededJob 夹具包含完整任务字段、sourceLesson 和合法 result，不用生产函数计算期望值。

~~~typescript
test('unsaved edits block application', () => {
  const state = draftActionState(succeededJob, succeededJob.baseVersion, true);
  assert.equal(state.canApply, false);
  assert.match(state.reason || '', /未保存|修改/);
});
test('a newer saved version blocks application', () => {
  assert.equal(draftActionState(succeededJob, succeededJob.baseVersion + 1, false).canApply, false);
});
~~~

另测 queued、running、failed、applied、undone、可撤销及后续编辑状态。

- [x] Step 2 运行 node --test tests/ai-editor.test.ts。Expected: 页面动作状态未实现，测试失败。
- [x] Step 3 实现整课表单（主题、受众、期望时长）和单节表单（当前节、修改要求）；未配置密钥时显示本机说明并禁用生成，不在网页填写密钥。
- [x] Step 4 展示完整草稿，包括画面、讲解和对比字段；按钮明确写「应用并替换整份课程」或「应用到此小节」，提供放弃与适用时的撤销。
- [x] Step 5 仅轮询读取状态，刷新恢复最新未放弃结果；手动重试基于当前课程。脏草稿或版本不符时应用按钮禁用且显示原因。
- [x] Step 6 运行 npm test、npm run typecheck，检查桌面及窄屏。Expected: 所有测试通过；新增、删节、AI 操作不导致选择越界、重复生成或自动配音。
- [x] Step 7 只暂存本任务 Files 中的文件，再提交：

~~~powershell
git commit -m 'feat: add reviewed AI drafting workflow to the editor'
~~~

## Task 5 完整验收与操作指南

**Files:** 完善 scripts/verify-ai.mjs；更新 scripts/verify-narration.mjs、docs/操作指南.md、README.md 及本计划执行记录。

verify-ai.mjs 使用独立端口与 DATA_DIR，启动本机 DeepSeek、腾讯云协议夹具及自己的 Web/Worker。使用固定虚拟密钥，不继承真实密钥，全部 fetch 设置超时；结束时仅停止自身启动的进程，不删除数据。夹具课程包含 steps、comparison 及可局部改写的小节。

- [x] Step 1 完整运行以下 HTTP 验收，使用与现有 verify-narration.mjs 同样的 api、launch、waitFor 辅助方法，验证真实业务代码。

~~~javascript
const body = {
  version: project.version,
  input: { kind: 'lesson', topic: '缓存', audience: '初学者', targetSeconds: 60 }
};
const path = '/api/projects/' + project.id + '/ai';
const first = await api(path, 'POST', body);
const repeated = await api(path, 'POST', body);
assert.equal(first.status, 202);
assert.equal(first.data.id, repeated.data.id);
~~~

后续断言顺序：

1. 配置只返回公开字段，重复提交调用一次，刷新读取同一结果。
2. 完成尚未应用时课程不变；应用、重复应用、撤销及重复撤销的版本变化正确。
3. 单节改写仅影响目标节并保留 ID、音色；变化节旧配音失效，其他配音可复用。
4. 后续编辑、删节或另项目访问被正确拒绝。
5. HTTP 402、429、超时、格式错误不自动重试，不修改原课程。
6. 生成或应用 AI 草稿不调用 TTS；显式生成配音才请求本机夹具。
7. 测试音通过音频范围请求可读取；新模板 MP4 经 ffprobe 检查有 H.264 视频、AAC 音轨和正确总时长。

- [x] Step 2 运行 npm test、npm run typecheck、git diff --check。Expected: 全部通过。
- [x] Step 3 按 Global Constraints 处理运行服务后执行 npm run build。Expected: 构建成功且保留项目数据与腾讯云配置。
- [x] Step 4 运行 node scripts/verify-ai.mjs 和原配音协议验收。Expected: 全部断言通过，日志注明模拟结果，无真实模型或配音调用。
- [x] Step 5 用 Remotion 生成正常及最大允许文字的步骤、对比截图，查看图片检查遮挡、溢出和动画帧；用浏览器检查新增、复制、删除、AI 表单、预览、放弃、撤销及未保存编辑保护。
- [x] Step 6 更新操作指南和 README，写清新增步骤、DeepSeek 配置和验收命令，期望时长仅为规划值。没有真实密钥时注明尚未完成真实模型验收，保留手动工作流程。
- [ ] Step 7 安排独立代码审查；影响数据、密钥、版本、重复调用或导出的发现先写失败测试，再修复并跑全套验证。
- [x] Step 8 重启工作台，检查首页、项目、AI 配置、任务列表、Web/Worker 日志。DeepSeek 未配置时 configured=false，已配置的腾讯云继续可用。
- [x] Step 9 扫描待提交文件及历史中的本机凭据，确认 .env.local 和 data 被忽略；仅提交验收脚本、指南、README 和执行记录。

~~~powershell
git commit -m 'docs: document and verify AI lesson creation workflow'
~~~

不自动合并主分支；用户要求上传时再推送已验证的开发分支。

## 执行记录

实施者按顺序勾选步骤，每个任务记录提交范围、完整验证命令和结果。接口调整记录原因及影响，后续任务以记录为准。禁止为清理临时记录执行递归或批量删除。

当前基线：feat/ai-lessons 分支，设计提交 8acbde4；设计于 2026 年 11 月 25 日获确认；既有测试基线为 29 项通过。本计划编写期间未修改功能代码、密钥或运行数据。

推荐由当前助手在本会话逐项实施，最后安排一次独立审查。五项共享数据格式与版本规则，按顺序验证便于保持兼容；也可以选择子代理逐项开发并逐项审查。

2026-11-25 实现记录：
- Task 1 fb216a1：五种模板和小节新增/复制/删除，35 项测试通过。
- Task 2 bf1a19f：DeepSeek JSON 接口、输入与生成内容校验，42 项测试通过。
- Task 3 060393f：SQLite 持久任务、幂等应用/撤销、版本与项目隔离，49 项测试通过。
- Task 4 a228ab1：AI 表单、预览、审核操作和未保存编辑保护，52 项测试通过。
- Task 5：页面验收修复撤销后旧草稿回显，补充回归后 53/53 测试、typecheck、diff --check 和生产构建通过。
- 独立本机 AI 夹具：9 次模拟文字请求、3 次模拟配音请求；覆盖 HTTP 402/429、无效 JSON、连接中断和真实 120 秒超时；新模板 MP4 为 H.264/AAC、6.016 秒。没有调用真实厂商。
- 腾讯云与 MiniMax 原协议验收通过，带声音 MP4 分别为 13.717、13.700 秒；新增步骤/对比画面不影响旧配音流程。
- 生成并人工查看四张普通/极限文字 Remotion 截图；100 字标题、5×80 字步骤、两侧各 4×60 字要点、3000 字讲解无画面重叠，底部讲解限制三行。
- 浏览器检查新增/复制/删除、整课生成与应用、单节改写、放弃、撤销、刷新恢复、未保存内容保护。手机宽度页面未横向溢出。
- Web/Worker 已用原数据和配置重启在 127.0.0.1:3000；首页与项目页面返回 200。腾讯云 configured=true；DeepSeek configured=false，真实模型效果待配置本机密钥。
- 测试产物保留在 Git 忽略的 data 下，不批量删除。不自动合并或上传。
