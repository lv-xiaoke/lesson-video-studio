import { join } from 'node:path';
import { ProjectStore } from './store.ts';
import { dataRoot } from '../storage/index.ts';
const globalStore = globalThis as typeof globalThis & { lessonStore?: ProjectStore };
export function getStore() {
  if (!globalStore.lessonStore) globalStore.lessonStore = new ProjectStore(join(dataRoot(), 'app.sqlite'));
  return globalStore.lessonStore;
}
