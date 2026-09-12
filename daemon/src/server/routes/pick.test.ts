import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HerdrAgent } from '../../herdr/types.ts';
import type { PickRecord } from '../../payload/pick-record.ts';
import { createPickTracker, type PickTracker } from '../../picks/pick-tracker.ts';
import type { RouteContext } from '../router.ts';
import { createFollowUpHandler, createPickStatusHandler } from './pick.ts';

const agent: HerdrAgent = {
  agent: 'claude',
  agent_status: 'idle',
  cwd: '/repo',
  focused: false,
  pane_id: 'w1:p1',
  workspace_id: 'w1',
  state_change_seq: 12,
  agent_session: { kind: 'id', value: 'session-a' },
};

const record: PickRecord = {
  pickId: 'pick-1',
  paneId: 'w1:p1',
  notePath: '/tmp/nudge-picks/pick-1/note.md',
  sessionId: 'session-a',
  baseSeq: 10,
  followUps: 0,
  sentAt: '2026-09-02T10:00:00.000Z',
};

function idleTracker(): PickTracker {
  return createPickTracker({ listAgents: async () => ({ ok: true, value: [] }), intervalMs: 60_000 });
}

function statusContext(query: string): RouteContext {
  return {
    url: new URL(`http://127.0.0.1:8791/pick?${query}`),
    readBody: async () => ({ ok: true, value: Buffer.alloc(0) }),
    readJson: async () => ({ ok: true, value: null }),
  };
}

function followUpContext(body: unknown): RouteContext {
  return {
    url: new URL('http://127.0.0.1:8791/pick/follow-up'),
    readBody: async () => ({ ok: true, value: Buffer.alloc(0) }),
    readJson: async () => ({ ok: true, value: body }),
  };
}

test('status needs a valid id', async () => {
  const tracker = idleTracker();
  const handle = createPickStatusHandler(tracker, { pollMs: 10 });
  try {
    assert.deepEqual(await handle(statusContext('since=0')), {
      status: 400,
      body: { error: 'A valid review id is required.' },
    });
    assert.equal((await handle(statusContext('id=../etc'))).status, 400);
  } finally {
    tracker.stop();
  }
});

test('status is 404 for a review neither tracked nor on disk', async () => {
  const tracker = idleTracker();
  const handle = createPickStatusHandler(tracker, {
    pollMs: 10,
    readPickRecord: async () => ({ ok: true, value: null }),
  });
  try {
    assert.deepEqual(await handle(statusContext('id=pick-9')), {
      status: 404,
      body: { error: 'Review pick-9 was not found. It may have been sent to another daemon or cleaned up.' },
    });
  } finally {
    tracker.stop();
  }
});

test('status rehydrates a review from pick.json after a restart', async () => {
  const tracker = idleTracker();
  const handle = createPickStatusHandler(tracker, {
    pollMs: 10,
    readPickRecord: async () => ({ ok: true, value: record }),
  });
  try {
    assert.deepEqual(await handle(statusContext('id=pick-1&since=-1')), {
      status: 200,
      body: {
        pickId: 'pick-1',
        paneId: 'w1:p1',
        status: 'queued',
        seq: 0,
        followUps: 0,
        notePath: '/tmp/nudge-picks/pick-1/note.md',
      },
    });
    assert.equal(tracker.get('pick-1')?.baseSeq, 10);
  } finally {
    tracker.stop();
  }
});

test('follow-up rejects an empty reply and an unknown review', async () => {
  const tracker = idleTracker();
  const handle = createFollowUpHandler(tracker, {
    readPickRecord: async () => ({ ok: true, value: null }),
  });
  try {
    assert.deepEqual(await handle(followUpContext({ pickId: 'pick-1', comment: '  ' })), {
      status: 400,
      body: { error: 'Write something in the reply before sending it.' },
    });
    assert.equal((await handle(followUpContext({ pickId: 'pick-1', comment: 'more' }))).status, 404);
  } finally {
    tracker.stop();
  }
});

test('follow-up is 409 when the pane no longer hosts the session that got the review', async () => {
  const tracker = idleTracker();
  let appended = false;
  const handle = createFollowUpHandler(tracker, {
    readPickRecord: async () => ({ ok: true, value: record }),
    listAgents: async () => ({
      ok: true,
      value: [{ ...agent, agent_session: { kind: 'id', value: 'session-b' } }],
    }),
    appendFollowUp: async () => {
      appended = true;
      return { ok: true, value: 1 };
    },
  });
  try {
    assert.deepEqual(await handle(followUpContext({ pickId: 'pick-1', comment: 'more' })), {
      status: 409,
      body: {
        error: 'Pane w1:p1 no longer has the agent that received this review. Send it as a new review instead.',
      },
    });
    assert.equal(appended, false);
  } finally {
    tracker.stop();
  }
});

test('follow-up appends, prompts, rearms the tracker and updates the record', async () => {
  const tracker = idleTracker();
  const prompts: string[] = [];
  let saved: PickRecord | null = null;
  const handle = createFollowUpHandler(tracker, {
    readPickRecord: async () => ({ ok: true, value: record }),
    listAgents: async () => ({ ok: true, value: [agent] }),
    appendFollowUp: async (notePath, comment) => {
      assert.equal(notePath, record.notePath);
      assert.equal(comment, 'Darker, please.');
      return { ok: true, value: 3 };
    },
    sendPrompt: async (paneId, text) => {
      prompts.push(`${paneId}: ${text}`);
      return { ok: true, value: undefined };
    },
    writePickRecord: async (directory, next) => {
      assert.equal(directory, '/tmp/nudge-picks/pick-1');
      saved = next;
      return { ok: true, value: undefined };
    },
  });
  try {
    assert.deepEqual(await handle(followUpContext({ pickId: 'pick-1', comment: 'Darker, please.' })), {
      status: 200,
      body: { pickId: 'pick-1', followUp: 3, notePath: '/tmp/nudge-picks/pick-1/note.md' },
    });
    assert.deepEqual(prompts, [
      'w1:p1: Browser review follow-up 3 — read the "## Follow-up 3" section at the end of @/tmp/nudge-picks/pick-1/note.md and address it.',
    ]);

    const tracked = tracker.get('pick-1');
    assert.equal(tracked?.status, 'queued');
    assert.equal(tracked?.baseSeq, 12);
    assert.equal(tracked?.followUps, 3);
    assert.deepEqual(saved, { ...record, followUps: 3 });
  } finally {
    tracker.stop();
  }
});
