import { parseLesson } from './lesson.ts';
import type { Lesson } from './lesson.ts';
import type { AiInput } from './ai.ts';

function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('AI 数据格式应为对象');
  return raw as Record<string, unknown>;
}
function text(raw: unknown, label: string, max: number) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > max) throw new Error(label + '不能为空，且最多 ' + max + ' 字');
  return raw.trim();
}
export function parseAiInput(raw: unknown): AiInput {
  const value = object(raw);
  if (value.kind === 'lesson') {
    if (typeof value.targetSeconds !== 'number' || !Number.isInteger(value.targetSeconds) || value.targetSeconds < 30 || value.targetSeconds > 600) throw new Error('期望时长应为 30～600 秒的整数');
    return { kind: 'lesson', topic: text(value.topic, '主题', 200), audience: text(value.audience, '教学对象', 80), targetSeconds: value.targetSeconds };
  }
  if (value.kind === 'scene') return { kind: 'scene', sceneId: text(value.sceneId, '小节 ID', 100), instruction: text(value.instruction, '改写要求', 1000) };
  throw new Error('AI 任务类型不正确');
}
export function normalizeAiResult(raw: unknown, input: AiInput, source: Lesson): Lesson {
  const value = object(raw);
  const parseScene = (rawScene: unknown, original?: Lesson['scenes'][number]) => {
    const scene = object(rawScene);
    if (typeof scene.kind !== 'string' || !['title', 'summary', 'steps', 'comparison'].includes(scene.kind)) throw new Error('AI 返回了不支持的画面类型');
    return {
      id: original?.id || crypto.randomUUID(), kind: scene.kind,
      title: text(scene.title, 'AI 小节标题', 60), content: text(scene.content, 'AI 屏幕文字', 500),
      narration: text(scene.narration, 'AI 讲解稿', 500), durationSeconds: scene.durationSeconds,
      comparison: scene.comparison, ...(original?.voice ? { voice: structuredClone(original.voice) } : {}),
    };
  };
  if (input.kind === 'lesson') {
    if (!Array.isArray(value.scenes) || !value.scenes.length || value.scenes.length > 20) throw new Error('AI 返回的小节数量应为 1～20 个');
    return parseLesson({ title: text(value.title, 'AI 视频标题', 100), scenes: value.scenes.map(s => parseScene(s)) });
  }
  const index = source.scenes.findIndex(s => s.id === input.sceneId);
  if (index < 0) throw new Error('要改写的小节不存在');
  const scenes: unknown[] = structuredClone(source.scenes);
  scenes[index] = parseScene(value.scene, source.scenes[index]);
  return parseLesson({ title: source.title, scenes });
}
