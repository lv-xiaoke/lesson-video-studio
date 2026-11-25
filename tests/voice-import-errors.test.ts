import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceImportError, publicVoiceImportMessage } from '../src/shared/voice-import.ts';
import { voiceImportErrorResponse } from '../src/server/voices/import-http.ts';
test('import public responses hide filesystem and malformed private config details', async () => {
  for (const error of [new Error('EACCES D:/private/service.json'), new SyntaxError('private-token config snippet')]) {
    const result = await voiceImportErrorResponse(error).json();
    assert.ok(!/private|EACCES|snippet/.test(result.error));
    assert.ok(!/private|EACCES|snippet/.test(publicVoiceImportMessage(error)));
  }
  assert.equal((await voiceImportErrorResponse(new VoiceImportError('视频没有可用音轨')).json()).error, '视频没有可用音轨');
});
