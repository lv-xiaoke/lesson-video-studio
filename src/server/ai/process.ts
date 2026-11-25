import type { AiJob } from '../../shared/ai.ts';
import { generateDraft } from '../providers/llm/deepseek.ts';
import { AiStore } from './store.ts';
export async function processAiJob(job: AiJob, store: AiStore, provider = generateDraft): Promise<AiJob> {
  const result = await provider(job);
  return store.complete(job.id, result);
}
