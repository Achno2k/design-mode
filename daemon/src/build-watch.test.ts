import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { watchBuild } from './build-watch.ts';

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'design-mode-build-'));
}

test('reports no change while the build output is untouched', async () => {
  const watcher = watchBuild(await scratch());
  try {
    const revision = await watcher.waitForChange(0, 60);
    assert.equal(revision, 0);
  } finally {
    watcher.stop();
  }
});

test('answers at once when the caller is already behind', async () => {
  const watcher = watchBuild(await scratch());
  try {
    // A caller that has never polled passes -1 and should not be made to wait.
    assert.equal(await watcher.waitForChange(-1, 60), 0);
  } finally {
    watcher.stop();
  }
});

test('collapses the several writes of one build into a single revision', async () => {
  const directory = await scratch();
  const watcher = watchBuild(directory);

  try {
    const changed = watcher.waitForChange(0, 4_000);

    // Mimics a build: clear, write bundles, then copy static files.
    await writeFile(join(directory, 'background.js'), 'a');
    await new Promise((resolve) => setTimeout(resolve, 120));
    await writeFile(join(directory, 'content.js'), 'b');
    await new Promise((resolve) => setTimeout(resolve, 200));
    await writeFile(join(directory, 'manifest.json'), '{}');

    assert.equal(await changed, 1);
    assert.equal(watcher.revision(), 1);
  } finally {
    watcher.stop();
  }
});

test('does not fail when the build output does not exist yet', async () => {
  const watcher = watchBuild(join(await scratch(), 'never-built'));
  try {
    assert.equal(watcher.revision(), 0);
  } finally {
    watcher.stop();
  }
});
