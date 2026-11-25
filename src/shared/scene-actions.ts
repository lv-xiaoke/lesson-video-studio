import { parseLesson } from './lesson.ts';
import type { Lesson } from './lesson.ts';
import type { Scene, SceneKind } from './scene.ts';

export function changeSceneKind(scene: Scene, kind: SceneKind): Scene {
  const result = structuredClone(scene); result.kind = kind;
  if (kind === 'comparison' && !result.comparison) result.comparison = {
    leftTitle: '方式一', leftPoints: ['填写第一种方式的特点'], rightTitle: '方式二', rightPoints: ['填写第二种方式的特点'],
  };
  if (kind === 'steps') {
    const lines = result.content.split('\n').map(v => v.trim()).filter(Boolean);
    if (!lines.length || lines.length > 5 || lines.some(v => v.length > 80)) throw new Error('步骤应为 1～5 行，每行最多 80 字，请先调整屏幕文字');
  }
  return result;
}
export function appendScene(lesson: Lesson, kind: SceneKind = 'title'): Lesson {
  if (lesson.scenes.length >= 20) throw new Error('每条课程最多 20 个小节');
  const scene = changeSceneKind({ id: crypto.randomUUID(), kind: 'title', title: '新小节', content: '填写画面要点', narration: '在这里填写这一节的讲解。', durationSeconds: 8 }, kind);
  return parseLesson({ ...lesson, scenes: [...lesson.scenes, scene] });
}
export function duplicateScene(lesson: Lesson, sceneId: string): Lesson {
  const index = lesson.scenes.findIndex(s => s.id === sceneId);
  if (index < 0) throw new Error('小节不存在');
  if (lesson.scenes.length >= 20) throw new Error('每条课程最多 20 个小节');
  const scenes = structuredClone(lesson.scenes);
  const copy = structuredClone(scenes[index]); copy.id = crypto.randomUUID();
  scenes.splice(index + 1, 0, copy);
  return parseLesson({ ...lesson, scenes });
}
export function removeScene(lesson: Lesson, sceneId: string): Lesson {
  if (!lesson.scenes.some(s => s.id === sceneId)) throw new Error('小节不存在');
  if (lesson.scenes.length <= 1) throw new Error('至少保留一个小节');
  return parseLesson({ ...lesson, scenes: lesson.scenes.filter(s => s.id !== sceneId) });
}
