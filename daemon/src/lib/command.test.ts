import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runCommand, runCommandAllowingEmpty } from './command.ts';

test('runs arguments without a shell and returns stdout', async () => {
  const value = '$(echo should-not-run)';
  const result = await runCommand(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', value]);
  assert.deepEqual(result, { ok: true, value });
});

test('retains readable stderr for non-zero exits and supports empty matches', async () => {
  const failed = await runCommand(process.execPath, [
    '-e',
    'process.stderr.write("action failed"); process.exit(2)',
  ]);
  assert.equal(failed.ok, false);
  assert.match(failed.ok ? '' : failed.error, /action failed/);

  const empty = await runCommandAllowingEmpty(process.execPath, ['-e', 'process.exit(1)']);
  assert.deepEqual(empty, { ok: true, value: '' });
});

test('stops a subprocess after its timeout', async () => {
  const result = await runCommand(
    process.execPath,
    ['-e', 'setTimeout(() => {}, 10_000)'],
    20,
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.error, /did not finish in time/);
});
