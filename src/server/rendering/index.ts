import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Job } from '../../shared/job.ts';
import { managedPath } from '../storage/index.ts';

let bundlePromise: Promise<string> | undefined;
export async function renderJob(job: Job, onProgress: (progress: number) => void): Promise<string> {
  // Worker restart refreshes the bundle. Development changes require restarting Worker.
  if (!bundlePromise) bundlePromise = bundle({ entryPoint: resolve('src/video/index.ts') }).catch(error => { bundlePromise = undefined; throw error; });
  const serveUrl = await bundlePromise;
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || undefined;
  const inputProps = { lesson: job.lesson };
  const composition = await selectComposition({ serveUrl, id: 'Lesson', inputProps, browserExecutable });
  const relative = `projects/${job.projectId}/exports/${job.id}/video.mp4`;
  const outputLocation = managedPath(relative);
  await mkdir(dirname(outputLocation), { recursive: true });
  await writeFile(resolve(dirname(outputLocation), 'manifest.json'), JSON.stringify({ projectId: job.projectId, projectVersion: job.version, lesson: job.lesson, fps: composition.fps, width: composition.width, height: composition.height, createdAt: new Date().toISOString() }, null, 2));
  const rawConcurrency = Number(process.env.RENDER_CONCURRENCY || 2);
  const concurrency = Number.isInteger(rawConcurrency) && rawConcurrency > 0 ? rawConcurrency : 2;
  await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation, inputProps, browserExecutable, concurrency, onProgress: ({ progress }) => onProgress(progress) });
  return relative;
}
