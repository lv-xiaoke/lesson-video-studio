// Render local template samples for human inspection. No vendor calls or credentials.
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseLesson } from '../src/shared/lesson.ts';

const root = resolve('data/visual-verification', randomUUID());
mkdirSync(root, { recursive: true });
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const serveUrl = await bundle({ entryPoint: resolve('src/video/index.ts') });
const outputs = [];
for (const maximum of [false, true]) {
  const lesson = parseLesson({ title: '理解缓存', scenes: [
    { id: 'steps', kind: 'steps', title: maximum ? '如何把复杂问题分解为容易理解并且可以重复执行的具体步骤'.repeat(4).slice(0, 100) : '缓存的三个步骤',
      content: maximum ? Array.from({ length: 5 }, (_, i) => `${i + 1}先检查当前输入是否已有可复用的结果再决定下一步如何处理`.repeat(4).slice(0, 80)).join('\n') : '先检查缓存\n未命中时计算\n保存结果供下次使用',
      narration: maximum ? '这段完整讲解会保留在配音中，画面底部仅显示有限行数。'.repeat(150).slice(0, 3000) : '先检查缓存，没有结果时再计算，最后保存结果。', durationSeconds: 3 },
    { id: 'comparison', kind: 'comparison', title: maximum ? '比较两种不同处理方式的特点并理解各自适合使用的场景'.repeat(4).slice(0, 100) : '使用缓存前后有什么不同', content: '两种处理方式',
      narration: maximum ? '比较两种方式，帮助我们理解为什么需要缓存，以及什么时候应当更新结果。'.repeat(150).slice(0, 3000) : '没有缓存需要重复计算，使用缓存可以直接复用结果。', durationSeconds: 3,
      comparison: { leftTitle: maximum ? '没有缓存时需要重复进行哪些具体处理'.repeat(3).slice(0, 30) : '没有缓存',
        rightTitle: maximum ? '使用缓存后能够减少哪些重复操作'.repeat(3).slice(0, 30) : '使用缓存',
        leftPoints: maximum ? Array(4).fill('每次收到相同请求仍然需要重新计算并等待完整结果返回'.repeat(3).slice(0, 60)) : ['重复计算', '等待时间较长'],
        rightPoints: maximum ? Array(4).fill('复用此前已经完成的计算结果并在数据发生变化时更新缓存'.repeat(3).slice(0, 60)) : ['复用结果', '及时更新缓存'] } },
  ] });
  const inputProps = { lesson };
  const composition = await selectComposition({ serveUrl, id: 'Lesson', inputProps, browserExecutable });
  for (const [kind, frame] of [['steps', 75], ['comparison', 165]]) {
    const output = join(root, `${kind}-${maximum ? 'maximum' : 'normal'}.png`);
    await renderStill({ serveUrl, composition, inputProps, browserExecutable, output, frame });
    outputs.push(output);
  }
}
writeFileSync(join(root, 'result.json'), JSON.stringify(outputs, null, 2));
console.log(JSON.stringify(outputs));
