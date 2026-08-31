import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ok } from '../result.ts';
import { resolveProjectDir } from './dev-server.ts';

test('sorts listener PIDs and prefers the first cwd that belongs to a git repository', async () => {
  const inspected: string[] = [];
  const result = await resolveProjectDir('http://localhost:3000', {
    runCommand: async (_binary, args) => {
      if (args.includes('-t')) return ok('20\n10\n');
      const pid = args[args.indexOf('-p') + 1] ?? '';
      inspected.push(pid);
      return ok(pid === '10' ? 'p10\nn/tmp/unrelated\n' : 'p20\nn/work/repository/app\n');
    },
    findRepoRoot: async (directory) =>
      ok(directory.includes('/work/repository') ? '/work/repository' : null),
  });

  assert.deepEqual(inspected, ['10', '20']);
  assert.deepEqual(result, { ok: true, value: '/work/repository/app' });
});

test('falls back deterministically to the lowest-PID readable cwd', async () => {
  const result = await resolveProjectDir('http://127.0.0.1:5173', {
    runCommand: async (_binary, args) => {
      if (args.includes('-t')) return ok('9\n3\n');
      const pid = args[args.indexOf('-p') + 1] ?? '';
      return ok(`p${pid}\nn/project-${pid}\n`);
    },
    findRepoRoot: async () => ok(null),
  });

  assert.deepEqual(result, { ok: true, value: '/project-3' });
});
