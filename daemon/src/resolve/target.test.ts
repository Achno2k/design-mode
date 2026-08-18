import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HerdrAgent } from '../herdr/types.ts';
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

test('keeps agents sitting inside the scope', () => {
  const targets = rankTargets([agent({ cwd: '/repo/apps/web' })], '/repo');
  assert.equal(targets.length, 1);
});

test('ignores an agent parked in a parent directory', () => {
  // A pane opened in the home directory must not claim every project below it.
  const targets = rankTargets([agent({ cwd: '/Users/me' })], '/Users/me/repo');
  assert.deepEqual(targets, []);
});

test('does not treat a shared name prefix as containment', () => {
  const targets = rankTargets([agent({ cwd: '/repo-clip-web' })], '/repo');
  assert.deepEqual(targets, []);
});

test('matches on the foreground directory when the pane itself moved', () => {
  const targets = rankTargets([agent({ cwd: '/elsewhere', foreground_cwd: '/repo/api' })], '/repo');
  assert.equal(targets.length, 1);
});

test('the focused pane outranks a more recently active one', () => {
  const targets = rankTargets(
    [
      agent({ pane_id: 'w1:p1', state_change_seq: 900 }),
      agent({ pane_id: 'w1:p2', state_change_seq: 100, focused: true }),
    ],
    '/repo',
  );
  assert.equal(targets[0]?.paneId, 'w1:p2');
});

test('otherwise the highest state_change_seq wins', () => {
  const targets = rankTargets(
    [
      agent({ pane_id: 'w1:p1', state_change_seq: 100 }),
      agent({ pane_id: 'w1:p2', state_change_seq: 900 }),
    ],
    '/repo',
  );
  assert.deepEqual(targets.map((t) => t.paneId), ['w1:p2', 'w1:p1']);
});

test('strips the status glyph herdr leaves on the title', () => {
  const targets = rankTargets([agent({ terminal_title_stripped: '◑ Fix the header' })], '/repo');
  assert.equal(targets[0]?.label, 'Fix the header');
});

test('falls back to the pane id when there is no title', () => {
  const targets = rankTargets([agent({ pane_id: 'w1:pA' })], '/repo');
  assert.equal(targets[0]?.label, 'w1:pA');
});
