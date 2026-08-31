import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { HerdrAgent, Target } from '../herdr/types.ts';
import { ok } from '../result.ts';
import { rankTargets } from './target.ts';

function agent(overrides: Partial<HerdrAgent>): HerdrAgent {
  return {
    agent: 'claude',
    agent_status: 'idle',
    cwd: '/repo',
    focused: false,
    pane_id: 'w1:p1',
    workspace_id: 'w1',
    state_change_seq: 1,
    ...overrides,
  };
}

async function targets(agents: HerdrAgent[], scope: string): Promise<Target[]> {
  const ranked = await rankTargets(agents, scope, async (path) => ok(path));
  assert.equal(ranked.ok, true);
  return ranked.ok ? ranked.value : [];
}

test('keeps agents sitting inside the scope', async () => {
  assert.equal((await targets([agent({ cwd: '/repo/apps/web' })], '/repo')).length, 1);
});

test('ignores an agent parked in a parent directory', async () => {
  assert.deepEqual(await targets([agent({ cwd: '/Users/me' })], '/Users/me/repo'), []);
});

test('does not treat a shared name prefix as containment', async () => {
  assert.deepEqual(await targets([agent({ cwd: '/repo-clip-web' })], '/repo'), []);
});

test('matches on the foreground directory when the pane itself moved', async () => {
  const ranked = await targets([agent({ cwd: '/elsewhere', foreground_cwd: '/repo/api' })], '/repo');
  assert.equal(ranked.length, 1);
});

test('the focused pane outranks a more recently active one', async () => {
  const ranked = await targets(
    [
      agent({ pane_id: 'w1:p1', state_change_seq: 900 }),
      agent({ pane_id: 'w1:p2', state_change_seq: 100, focused: true }),
    ],
    '/repo',
  );
  assert.equal(ranked[0]?.paneId, 'w1:p2');
});

test('otherwise the highest state_change_seq wins', async () => {
  const ranked = await targets(
    [
      agent({ pane_id: 'w1:p1', state_change_seq: 100 }),
      agent({ pane_id: 'w1:p2', state_change_seq: 900 }),
    ],
    '/repo',
  );
  assert.deepEqual(ranked.map((target) => target.paneId), ['w1:p2', 'w1:p1']);
});

test('strips the status glyph herdr leaves on the title', async () => {
  const ranked = await targets([agent({ terminal_title_stripped: '◑ Fix the header' })], '/repo');
  assert.equal(ranked[0]?.label, 'Fix the header');
});

test('falls back to the pane id when there is no title', async () => {
  const ranked = await targets([agent({ pane_id: 'w1:pA' })], '/repo');
  assert.equal(ranked[0]?.label, 'w1:pA');
});

test('canonicalizes symlinked agent paths before containment', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'design-mode-target-'));
  const repository = join(scratch, 'repository');
  const link = join(scratch, 'linked-repository');
  await mkdir(join(repository, 'apps', 'web'), { recursive: true });
  await symlink(repository, link);

  const ranked = await rankTargets([agent({ cwd: join(link, 'apps', 'web') })], repository);
  assert.equal(ranked.ok, true);
  assert.equal(ranked.ok ? ranked.value.length : 0, 1);
});
