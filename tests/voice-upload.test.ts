import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { writeMediaUpload } from '../src/server/voices/upload.ts';
test('media upload limits actual stream bytes and never writes beyond the cap', async () => {
  const path = resolve('data/test-voice-upload', randomUUID(), 'source.bin');
  await assert.rejects(writeMediaUpload(new Request('http://localhost', { method: 'POST', body: '123456789' }), path, 4), /200 MB|大小|超出/);
  await assert.rejects(stat(path), { code: 'ENOENT' });
});
test('successful streaming upload preserves bytes and refuses empty input or aborted stream', async () => {
  const path = resolve('data/test-voice-upload', randomUUID(), 'source.bin');
  await writeMediaUpload(new Request('http://localhost', { method: 'POST', body: 'full payload' }), path, 20);
  assert.equal((await readFile(path)).toString(), 'full payload');
  await assert.rejects(writeMediaUpload(new Request('http://localhost', { method: 'POST', body: '' }), path + '.empty', 20), /为空/);
  await assert.rejects(stat(path + '.empty'), { code: 'ENOENT' });
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.error(new Error('interrupted')); } });
  await assert.rejects(writeMediaUpload(new Request('http://localhost', { method: 'POST', body: stream, duplex: 'half' } as RequestInit), path + '.abort', 20), /interrupted/);
  await assert.rejects(stat(path + '.abort'), { code: 'ENOENT' });
});
