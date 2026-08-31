import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ok } from '../result.ts';
import { resolveProjectScope } from './scope.ts';

test('widens the port-resolved project directory to its repository', async () => {
  const result = await resolveProjectScope('http://localhost:3000', {
    resolveProjectDir: async () => ok('/repo/apps/web'),
    canonicalizePath: async (path) => ok(path),
    findRepoRoot: async () => ok('/repo'),
  });

  assert.deepEqual(result, {
    ok: true,
    value: { projectDir: '/repo/apps/web', scope: '/repo' },
  });
});

test('falls back to the project directory when it is not in a repository', async () => {
  const result = await resolveProjectScope('http://localhost:3000', {
    resolveProjectDir: async () => ok('/apps/web'),
    canonicalizePath: async (path) => ok(path),
    findRepoRoot: async () => ok(null),
  });

  assert.deepEqual(result, {
    ok: true,
    value: { projectDir: '/apps/web', scope: '/apps/web' },
  });
});
