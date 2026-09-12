import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execFileAsync = promisify(execFile);

test('launcher explains that it must run inside herdr', async () => {
  const launcher = new URL('../../bin/nudge.mjs', import.meta.url);
  const environment = { ...process.env };
  delete environment.HERDR_ENV;

  await assert.rejects(
    execFileAsync(process.execPath, [launcher.pathname], { env: environment }),
    (cause: unknown) => {
      assert.ok(cause instanceof Error);
      const stderr = (cause as Error & { stderr?: string }).stderr ?? '';
      assert.match(stderr, /must be started from a pane in your herdr session/);
      return true;
    },
  );
});
