// Conservative character widths leave room for the bullet and for font differences.
export function teachingTextLayout(content: string, kind: 'title' | 'summary') {
  const source = content.split('\n').map(line => line.trim()).filter(Boolean);
  const preferred = kind === 'title' ? [47, 38, 32, 28, 24, 22, 20] : [38, 32, 28, 24, 22, 20];
  for (const paragraphs of [source, [source.join(' ')]]) {
    for (const fontSize of preferred) {
      const lineHeight = 1.35;
      const gap = fontSize >= 38 ? 23 : 6;
      const capacity = Math.floor(1560 / fontSize);
      const rows = paragraphs.reduce((sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).length / capacity)), 0);
      const estimatedHeight = rows * fontSize * lineHeight + Math.max(0, paragraphs.length - 1) * gap;
      if (estimatedHeight <= 425) return { paragraphs, fontSize, lineHeight, gap, estimatedHeight };
    }
  }
  throw new Error('画面文字超过可显示范围'); // parseLesson bounds content to 1000 characters.
}
// Every paragraph appears within the first second, including three-second scenes.
export function teachingTextOpacity(frame: number, _paragraphIndex: number) {
  return Math.max(0, Math.min(1, (frame - 6) / 14));
}
