import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { cleanExpiredPicks } from './cleanup.ts';

const DAY = 24 * 60 * 60 * 1_000;

async function doesExist(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('deletes expired picks and orphaned blobs but keeps recent entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'design-mode-cleanup-'));
  const oldPick = join(root, 'old-pick');
  const recentPick = join(root, 'recent-pick');
  const blobs = join(root, '.blobs');
  await mkdir(oldPick);
  await mkdir(recentPick);
  await mkdir(blobs);
  const oldBlob = join(blobs, 'old.png');
  const recentBlob = join(blobs, 'recent.png');
  await writeFile(oldBlob, 'old');
  await writeFile(recentBlob, 'recent');

  const now = Date.now();
  const oldTime = new Date(now - 8 * DAY);
  await utimes(oldPick, oldTime, oldTime);
  await utimes(oldBlob, oldTime, oldTime);

  const result = await cleanExpiredPicks(root, now, 7 * DAY);
  assert.equal(result.ok, true);
  assert.equal(await doesExist(oldPick), false);
  assert.equal(await doesExist(oldBlob), false);
  assert.equal(await doesExist(recentPick), true);
  assert.equal(await doesExist(recentBlob), true);
});
