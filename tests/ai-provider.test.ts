import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createExampleLesson } from '../src/shared/lesson.ts';
const validation = () => import('../src/shared/ai-validation.ts');
const provider = () => import('../src/server/providers/llm/deepseek.ts');
const names = ['DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'DEEPSEEK_API_ENDPOINT'] as const;
const initial = names.map(k => process.env[k]);
beforeEach(() => { process.env.DEEPSEEK_API_KEY = 'fixture-only-secret'; process.env.DEEPSEEK_MODEL = 'deepseek-flash'; delete process.env.DEEPSEEK_API_ENDPOINT; });
afterEach(() => names.forEach((k, i) => { if (initial[i] === undefined) delete process.env[k]; else process.env[k] = initial[i]; }));
const scene = { kind: 'title', title: '理解缓存', content: '重复使用已有结果', narration: '缓存会保留可复用的结果。', durationSeconds: 8 };
const input = { kind: 'lesson' as const, topic: '缓存', audience: '初学者', targetSeconds: 60 };
function job() {
  return { id: 'ai-test', projectId: 'p', baseVersion: 1, model: 'deepseek-flash', input, sourceLesson: createExampleLesson(), status: 'running' as const,
    result: null, error: null, usage: null, appliedVersion: null, undoneVersion: null, createdAt: '2026-11-25' };
}
const response = (content: string, reason = 'stop') => Response.json({ choices: [{ message: { content }, finish_reason: reason }], usage: { prompt_tokens: 20, completion_tokens: 40 } });

test('AI requests have bounded fields and do not coerce malformed user input', async () => {
  const { parseAiInput } = await validation();
  assert.deepEqual(parseAiInput({ ...input, topic: ' 缓存 ' }), input);
  for (const raw of [{ ...input, targetSeconds: '60' }, { ...input, targetSeconds: 29 }, { ...input, topic: '' }, { kind: 'scene', sceneId: 'intro', instruction: ' ' }, { kind: ['lesson'] }]) {
    assert.throws(() => parseAiInput(raw));
  }
});

test('AI rewrite preserves identity, voice, course title and every untargeted scene', async () => {
  const { normalizeAiResult } = await validation();
  const source = createExampleLesson(); source.scenes[0].voice = { voiceId: '101001', speed: 1.2 };
  const before = structuredClone(source);
  const result = normalizeAiResult({ title: '不可覆盖', scene: { ...scene, id: 'injected', voice: { voiceId: '402000', speed: 2 } } },
    { kind: 'scene', sceneId: 'intro', instruction: '讲简单一些' }, source);
  assert.equal(result.scenes[0].id, 'intro');
  assert.deepEqual(result.scenes[0].voice, source.scenes[0].voice);
  assert.deepEqual(result.scenes.slice(1), source.scenes.slice(1));
  assert.equal(result.title, source.title); assert.deepEqual(source, before);
});

test('AI lesson assigns new ids and rejects malformed or unsupported teaching data', async () => {
  const { normalizeAiResult } = await validation();
  const source = createExampleLesson();
  const result = normalizeAiResult({ title: '缓存', scenes: [{ ...scene, id: 'same', voice: { voiceId: '402000', speed: 2 } }, { ...scene, id: 'same' }] }, input, source);
  assert.equal(new Set(result.scenes.map(s => s.id)).size, 2);
  assert(result.scenes.every(s => s.id !== 'same' && !s.voice));
  for (const raw of [{}, { title: '缓存', scenes: [] }, { title: '缓存', scenes: [{ ...scene, narration: '长'.repeat(501) }] },
    { title: '缓存', scenes: [{ ...scene, kind: 'array' }] }, { title: '缓存', scenes: [{ ...scene, kind: 'comparison' }] }]) {
    assert.throws(() => normalizeAiResult(raw, input, source));
  }
  assert.throws(() => normalizeAiResult({ scene }, { kind: 'scene', sceneId: 'missing', instruction: '修改' }, source), /不存在/);
});

test('DeepSeek uses JSON output once and returns normalized teaching data and usage', async () => {
  const { generateDraft, aiConfig } = await provider();
  let calls = 0;
  const result = await generateDraft(job(), { fetcher: async (url, options) => {
    calls++;
    assert.equal(String(url), 'https://api.deepseek.com/chat/completions');
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer fixture-only-secret');
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, 'deepseek-flash'); assert.equal(body.stream, false);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.deepEqual(body.thinking, { type: 'disabled' });
    assert(body.messages[0].content.toLowerCase().includes('json'));
    assert(!JSON.stringify(body).includes('fixture-only-secret'));
    return response(JSON.stringify({ title: '缓存', scenes: [scene] }));
  } });
  assert.equal(calls, 1); assert.equal(result.lesson.title, '缓存');
  assert.deepEqual(result.usage, { promptTokens: 20, completionTokens: 40 });
  assert(!JSON.stringify(aiConfig()).includes('fixture-only-secret'));
  delete process.env.DEEPSEEK_API_KEY; assert.equal(aiConfig().configured, false);
});

test('DeepSeek failures never retry and do not reveal upstream error content', async () => {
  const { generateDraft } = await provider();
  for (const status of [401, 402, 429, 500]) {
    let calls = 0;
    await assert.rejects(generateDraft(job(), { fetcher: async () => { calls++; return new Response('fixture-only-secret', { status }); } }),
      e => e instanceof Error && !e.message.includes('fixture-only-secret') && e.message.includes(String(status)));
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(generateDraft(job(), { fetcher: async () => { calls++; throw new Error('fixture-only-secret'); } }), /不会自动重试/);
  assert.equal(calls, 1);
});

test('DeepSeek rejects blank, truncated, invalid JSON or unsupported results without another request', async () => {
  const { generateDraft } = await provider();
  for (const output of [response(' '), response('{}', 'length'), response('not json'), response('{}'), Response.json({ error: { message: 'fixture-only-secret' } })]) {
    let calls = 0;
    await assert.rejects(generateDraft(job(), { fetcher: async () => { calls++; return output; } }));
    assert.equal(calls, 1);
  }
  const result = await generateDraft(job(), { fetcher: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ title: '缓存', scenes: [scene] }) } }] }) });
  assert.equal(result.usage, null);
});

test('DeepSeek rejects invalid endpoints and a model changed after enqueue before sending credentials', async () => {
  const { generateDraft } = await provider();
  for (const endpoint of ['https://evil.example/chat/completions', 'https://api.deepseek.com/chat/completions?x=1', 'http://user:pass@127.0.0.1/chat/completions']) {
    process.env.DEEPSEEK_API_ENDPOINT = endpoint;
    await assert.rejects(generateDraft(job(), { fetcher: async () => { throw new Error('unexpected request'); } }), /地址/);
  }
  delete process.env.DEEPSEEK_API_ENDPOINT;
  process.env.DEEPSEEK_MODEL = 'different-model';
  await assert.rejects(generateDraft(job(), { fetcher: async () => { throw new Error('unexpected request'); } }), /模型/);
});
