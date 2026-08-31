import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findRepoRoot } from './repo.ts';

test('distinguishes a directory outside git from command failures', async () => {
  const outside = await findRepoRoot('/work/app', async () => ({
    ok: true,
    value: {
      stdout: '',
      stderr: 'fatal: not a git repository (or any of the parent directories): .git',
      exitCode: 128,
    },
  }));
  assert.deepEqual(outside, { ok: true, value: null });

  const missingGit = await findRepoRoot('/work/app', async () => ({
    ok: false,
    error: 'Could not find "git" — is it installed and on your PATH?',
  }));
  assert.deepEqual(missingGit, {
    ok: false,
    error: 'Could not find "git" — is it installed and on your PATH?',
  });

  const timedOut = await findRepoRoot('/work/app', async () => ({
    ok: false,
    error: '"git" did not finish in time and was stopped.',
  }));
  assert.deepEqual(timedOut, {
    ok: false,
    error: '"git" did not finish in time and was stopped.',
  });
});

test('returns a repository root and reports unexpected git errors', async () => {
  const found = await findRepoRoot('/work/app', async () => ({
    ok: true,
    value: { stdout: '/work\n', stderr: '', exitCode: 0 },
  }));
  assert.deepEqual(found, { ok: true, value: '/work' });

  const failure = await findRepoRoot('/work/app', async () => ({
    ok: true,
    value: { stdout: '', stderr: 'fatal: unsafe repository', exitCode: 128 },
  }));
  assert.equal(failure.ok, false);
  assert.match(failure.ok ? '' : failure.error, /unsafe repository/);
});
