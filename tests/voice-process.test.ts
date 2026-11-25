import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
test('local engine restart validates exact configuration, process creation and owner', () => {
  if (process.platform !== 'win32') return;
  const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tests/zipvoice-process.test.ps1'], { windowsHide: true, encoding: 'utf8' });
  assert.match(output, /checks passed/);
});
