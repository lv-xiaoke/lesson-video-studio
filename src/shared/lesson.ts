import type { Scene } from './scene.ts';
export type Lesson = { title: string; scenes: Scene[] };
export type Project = { id: string; version: number; updatedAt: string; lesson: Lesson };

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}不能为空，且最多 ${max} 字`);
  return value;
}
export function parseLesson(value: unknown): Lesson {
  if (!value || typeof value !== 'object') throw new Error('项目格式不正确');
  const input = value as Record<string, unknown>;
  const title = text(input.title, '标题', 100);
  if (!Array.isArray(input.scenes) || input.scenes.length < 1 || input.scenes.length > 20) throw new Error('小节数量应为 1～20 个');
  const ids = new Set<string>();
  const scenes: Scene[] = input.scenes.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw new Error('小节格式不正确');
    const s = raw as Record<string, unknown>;
    const id = text(s.id, '小节 ID', 100);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('小节 ID 格式不正确');
    if (ids.has(id)) throw new Error('小节 ID 不能重复');
    ids.add(id);
    if (typeof s.kind !== 'string' || !['title', 'array', 'summary'].includes(s.kind)) throw new Error('未知的画面类型');
    if (typeof s.durationSeconds !== 'number' || !Number.isFinite(s.durationSeconds) || s.durationSeconds < 3 || s.durationSeconds > 60) throw new Error('每小节时长应为 3～60 秒');
    let voice: Scene['voice'];
    if (s.voice !== undefined) {
      if (!s.voice || typeof s.voice !== 'object') throw new Error('音色设置不正确');
      const v = s.voice as Record<string, unknown>;
      if (typeof v.voiceId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(v.voiceId)) throw new Error('音色 ID 不正确');
      if (typeof v.speed !== 'number' || !Number.isFinite(v.speed) || v.speed < 0.5 || v.speed > 2) throw new Error('语速应为 0.5～2 倍');
      voice = { voiceId: v.voiceId, speed: v.speed };
    }
    return { id, kind: s.kind as Scene['kind'], title: text(s.title, '小节标题', 100), content: text(s.content, '画面文字', 1000), narration: text(s.narration, '讲解稿', 3000), durationSeconds: s.durationSeconds, ...(voice ? { voice } : {}) };
  });
  return { title, scenes };
}
export function createExampleLesson(title = '用二分查找，快速找到一个数'): Lesson {
  return { title, scenes: [
    { id: 'intro', kind: 'title', title: '每一次，都少找一半', content: '二分查找\n从有序数组开始', narration: '如果一组数字已经排好顺序，我们就不需要一个一个地查找。每次观察中间的数，就能缩小查找范围。', durationSeconds: 8 },
    { id: 'compare', kind: 'array', title: '目标是 11，先看中间的 7', content: '11 大于 7\n排除左半部分，继续向右查找', narration: '现在要找到十一。中间的数字是七。因为十一大于七，可以排除七及其左边的所有数字，在右半部分继续查找。', durationSeconds: 12 },
    { id: 'summary', kind: 'summary', title: '记住这三个步骤', content: '先确认数据已经有序\n比较中间值与目标值\n缩小范围，重复直到找到或范围为空', narration: '二分查找有三个要点：数据有序，比较中间值，再缩小范围。即使找不到目标值，也会在范围为空时结束。', durationSeconds: 9 },
  ] };
}
