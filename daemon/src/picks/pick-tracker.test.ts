import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HerdrAgent } from '../herdr/types.ts';
import { createPickTracker } from './pick-tracker.ts';

function agent(overrides: Partial<HerdrAgent> = {}): HerdrAgent {
  return {
    agent: 'claude',
    agent_status: 'idle',
    cwd: '/repo',
    focused: false,
    pane_id: 'w1:p1',
    workspace_id: 'w1',
    state_change_seq: 10,
    agent_session: { kind: 'id', value: 'session-a' },
    ...overrides,
  };
}

const pick = {
  pickId: 'pick-1',
  paneId: 'w1:p1',
  notePath: '/tmp/herdr-picks/pick-1/note.md',
  sessionId: 'session-a',
  baseSeq: 10,
  followUps: 0,
};

/** A tracker polling a mutable agent list every few milliseconds. */
function trackerOver(agents: { current: HerdrAgent[] }, now?: () => number) {
  return createPickTracker({
    listAgents: async () => ({ ok: true, value: agents.current }),
    intervalMs: 5,
    liveMs: 1_000,
    ...(now === undefined ? {} : { now }),
  });
}

test('starts queued and stays there until the agent moves past the base seq', async () => {
  const agents = { current: [agent({ agent_status: 'working', state_change_seq: 10 })] };
  const tracker = trackerOver(agents);
  try {
    const tracked = tracker.track(pick);
    assert.equal(tracked.status, 'queued');
    assert.equal(tracked.seq, 0);

    const unchanged = await tracker.waitForChange('pick-1', 0, 40);
    assert.equal(unchanged?.status, 'queued');
    assert.equal(unchanged?.seq, 0);
  } finally {
    tracker.stop();
  }
});

test('moves queued → working → done as the agent takes the turn', async () => {
  const agents = { current: [agent()] };
  const tracker = trackerOver(agents);
  try {
    tracker.track(pick);

    agents.current = [agent({ agent_status: 'working', state_change_seq: 11 })];
    const working = await tracker.waitForChange('pick-1', 0, 1_000);
    assert.equal(working?.status, 'working');
    assert.equal(working?.seq, 1);

    agents.current = [agent({ agent_status: 'idle', state_change_seq: 12 })];
    const done = await tracker.waitForChange('pick-1', 1, 1_000);
    assert.equal(done?.status, 'done');
    assert.equal(done?.seq, 2);
  } finally {
    tracker.stop();
  }
});

test('reports blocked, and done when an idle agent has moved past the base without being seen working', async () => {
  const agents = { current: [agent({ agent_status: 'blocked', state_change_seq: 11 })] };
  const tracker = trackerOver(agents);
  try {
    tracker.track(pick);
    assert.equal((await tracker.waitForChange('pick-1', 0, 1_000))?.status, 'blocked');

    agents.current = [agent({ agent_status: 'done', state_change_seq: 13 })];
    assert.equal((await tracker.waitForChange('pick-1', 1, 1_000))?.status, 'done');
  } finally {
    tracker.stop();
  }
});

test('marks the review lost when the pane empties or hosts a different session', async () => {
  const agents = { current: [agent()] };
  const tracker = trackerOver(agents);
  try {
    tracker.track(pick);
    agents.current = [agent({ agent_session: { kind: 'id', value: 'session-b' }, state_change_seq: 30 })];
    assert.equal((await tracker.waitForChange('pick-1', 0, 1_000))?.status, 'lost');

    tracker.track({ ...pick, pickId: 'pick-2', paneId: 'w9:p9' });
    assert.equal((await tracker.waitForChange('pick-2', 0, 1_000))?.status, 'lost');
  } finally {
    tracker.stop();
  }
});

test('a finished review keeps its status when the agent starts other work', async () => {
  const agents = { current: [agent({ agent_status: 'idle', state_change_seq: 11 })] };
  const tracker = trackerOver(agents);
  try {
    tracker.track(pick);
    assert.equal((await tracker.waitForChange('pick-1', 0, 1_000))?.status, 'done');

    agents.current = [agent({ agent_status: 'working', state_change_seq: 20 })];
    const later = await tracker.waitForChange('pick-1', 1, 40);
    assert.equal(later?.status, 'done');
    assert.equal(later?.seq, 1);
  } finally {
    tracker.stop();
  }
});

test('rearm returns to queued against the new base and counts the follow-up', async () => {
  const agents = { current: [agent({ agent_status: 'idle', state_change_seq: 11 })] };
  const tracker = trackerOver(agents);
  try {
    tracker.track(pick);
    assert.equal((await tracker.waitForChange('pick-1', 0, 1_000))?.status, 'done');

    const rearmed = tracker.rearm('pick-1', { baseSeq: 11, followUps: 1 });
    assert.equal(rearmed?.status, 'queued');
    assert.equal(rearmed?.followUps, 1);
    assert.equal(rearmed?.seq, 2);

    agents.current = [agent({ agent_status: 'working', state_change_seq: 12 })];
    assert.equal((await tracker.waitForChange('pick-1', 2, 1_000))?.status, 'working');
  } finally {
    tracker.stop();
  }
});

test('forgets a settled review once it has been live long enough', async () => {
  let clock = 0;
  const agents = { current: [agent({ agent_status: 'idle', state_change_seq: 11 })] };
  const tracker = trackerOver(agents, () => clock);
  try {
    tracker.track(pick);
    assert.equal((await tracker.waitForChange('pick-1', 0, 1_000))?.status, 'done');
    assert.equal(tracker.get('pick-1')?.status, 'done');

    clock = 1_001;
    assert.equal(tracker.get('pick-1'), undefined);
  } finally {
    tracker.stop();
  }
});

test('answers an unknown id at once, and a caller who is behind at once', async () => {
  const tracker = trackerOver({ current: [agent()] });
  try {
    assert.equal(await tracker.waitForChange('missing', 0, 1_000), undefined);
    tracker.track(pick);
    assert.equal((await tracker.waitForChange('pick-1', -1, 1_000))?.seq, 0);
  } finally {
    tracker.stop();
  }
});

test('keeps the last status when herdr cannot be listed', async () => {
  let calls = 0;
  const tracker = createPickTracker({
    listAgents: async () => {
      calls += 1;
      return calls === 1
        ? { ok: true, value: [agent({ agent_status: 'working', state_change_seq: 11 })] }
        : { ok: false, error: 'herdr is away' };
    },
    intervalMs: 5,
  });
  try {
    tracker.track(pick);
    assert.equal((await tracker.waitForChange('pick-1', 0, 1_000))?.status, 'working');
    const held = await tracker.waitForChange('pick-1', 1, 40);
    assert.equal(held?.status, 'working');
    assert.ok(calls > 1);
  } finally {
    tracker.stop();
  }
});

test('releases held long-polls immediately when stopped', async () => {
  const tracker = trackerOver({ current: [agent()] });
  tracker.track(pick);
  const started = Date.now();
  const waiting = tracker.waitForChange('pick-1', 0, 5_000);
  tracker.stop();

  assert.equal((await waiting)?.status, 'queued');
  assert.ok(Date.now() - started < 500);
});
