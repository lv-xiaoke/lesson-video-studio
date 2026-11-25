import type { AiConfig, AiJob, AiUsage } from '../../../shared/ai.ts';
import { normalizeAiResult } from '../../../shared/ai-validation.ts';
import { draftMessages } from '../../ai/prompts.ts';

export function aiConfig(): AiConfig {
  const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash';
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(model)) throw new Error('DEEPSEEK_MODEL 格式不正确');
  return { provider: 'deepseek', configured: Boolean(process.env.DEEPSEEK_API_KEY?.trim()), model };
}
function endpoint() {
  const url = new URL(process.env.DEEPSEEK_API_ENDPOINT || 'https://api.deepseek.com/chat/completions');
  const official = url.href === 'https://api.deepseek.com/chat/completions';
  const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    && url.pathname === '/chat/completions' && !url.username && !url.password && !url.search && !url.hash;
  if (!official && !local) throw new Error('DeepSeek 接入地址必须是官方地址，仅协议测试允许本机 HTTP 地址');
  return url.href;
}
export async function generateDraft(job: AiJob, options: { fetcher?: typeof fetch } = {}) {
  const config = aiConfig();
  if (!config.configured) throw new Error('请在 .env.local 配置 DEEPSEEK_API_KEY，并重启网页与后台程序');
  if (job.model !== config.model) throw new Error('DeepSeek 模型配置已变化，请重新提交任务');
  const url = endpoint();
  let response: Response;
  try {
    response = await (options.fetcher || fetch)(url, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.DEEPSEEK_API_KEY!.trim() },
      body: JSON.stringify({ model: job.model, messages: draftMessages(job), response_format: { type: 'json_object' }, max_tokens: 8192, stream: false, thinking: { type: 'disabled' } }),
      signal: AbortSignal.timeout(120_000), redirect: 'error',
    });
  } catch { throw new Error('DeepSeek 请求中断或超时，不会自动重试，请核对用量后手动重试'); }
  if (!response.ok) {
    const hint = response.status === 401 ? '密钥无效，请检查配置' : response.status === 402 ? '账号额度不足，请检查 DeepSeek 账号' : response.status === 429 ? '请求受限，请稍后手动重试' : '服务暂时不可用';
    throw new Error('DeepSeek 请求失败（HTTP ' + response.status + '）：' + hint + '；不会自动重试');
  }
  let raw: { choices?: { finish_reason?: string; message?: { content?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  try {
    const body = await response.text();
    if (body.length > 500_000) throw new Error('oversized');
    raw = JSON.parse(body);
  } catch { throw new Error('DeepSeek 返回格式错误或内容过大，不会自动重试'); }
  const choice = raw?.choices?.[0];
  if (choice?.finish_reason !== 'stop') throw new Error('DeepSeek 生成未完整结束，请调整要求后手动重试');
  const content = choice.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('DeepSeek 返回空内容，请调整要求后手动重试');
  let value: unknown;
  try { value = JSON.parse(content); } catch { throw new Error('DeepSeek 返回的内容不是合法 JSON，请手动重试'); }
  const lesson = normalizeAiResult(value, job.input, job.sourceLesson);
  const p = raw.usage?.prompt_tokens, c = raw.usage?.completion_tokens;
  const usage: AiUsage | null = Number.isInteger(p) && Number.isInteger(c) && p! >= 0 && c! >= 0 ? { promptTokens: p!, completionTokens: c! } : null;
  return { lesson, usage };
}
