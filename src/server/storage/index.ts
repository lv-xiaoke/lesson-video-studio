import { mkdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
export function dataRoot() {
  // Runtime data is external to the application bundle and is never deployment input.
  const root = resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || 'data');
  mkdirSync(root, { recursive: true });
  return root;
}
export function managedPath(relative: string) {
  const root = dataRoot(); const target = resolve(root, relative);
  if (!target.startsWith(root + sep)) throw new Error('文件路径不在项目数据目录内');
  return target;
}
