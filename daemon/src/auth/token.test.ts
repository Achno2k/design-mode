import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readOrCreateToken } from './token.ts';

test('creates a private 32-character pairing token and reuses it', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'design-mode-token-'));
  const tokenPath = join(scratch, '.nudge', 'token');

  const created = await readOrCreateToken(tokenPath);
  assert.equal(created.ok, true);
  const token = created.ok ? created.value : '';
  assert.match(token, /^[0-9a-f]{32}$/);
  assert.equal((await stat(join(scratch, '.nudge'))).mode & 0o777, 0o700);
  assert.equal((await stat(tokenPath)).mode & 0o777, 0o600);
  assert.equal((await readFile(tokenPath, 'utf8')).trim(), token);

  const reused = await readOrCreateToken(tokenPath);
  assert.deepEqual(reused, created);
});

test('reports an invalid persisted token with an actionable error', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'design-mode-token-'));
  const tokenPath = join(scratch, 'state', 'token');
  await readOrCreateToken(tokenPath);
  await writeFile(tokenPath, 'not-a-token\n');

  const result = await readOrCreateToken(tokenPath);
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.error, /Delete it and restart/);
});
