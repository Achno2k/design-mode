import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HerdrAgent } from '../../herdr/types.ts';
import { createPickTracker, type PickTracker } from '../../picks/pick-tracker.ts';
import { createSendHandler } from './send.ts';

/** A tracker that never reaches herdr; every test stops it before returning. */
function idleTracker(): PickTracker {
  return createPickTracker({ listAgents: async () => ({ ok: true, value: [] }), intervalMs: 60_000 });
}

const liveAgent: HerdrAgent = {
  agent: 'codex',
  agent_status: 'idle',
  cwd: '/repo',
  focused: true,
  pane_id: 'w1:p1',
  workspace_id: 'ws1',
  state_change_seq: 7,
};

function sendContext() {
  return {
    url: new URL('http://127.0.0.1:8791/send'),
    readBody: async () => ({ ok: true as const, value: Buffer.alloc(0) }),
    readJson: async () => ({
      ok: true as const,
      value: {
        url: 'http://localhost:3000',
        paneId: 'w1:p1',
        pageNote: 'Review the whole page flow.',
        selections: [],
      },
    }),
  };
}

test('rejects a blocked target before writing files or prompting', async () => {
  let wrote = false;
  let prompted = false;

  const tracker = idleTracker();
  const handleSend = createSendHandler(tracker, {
    listAgents: async () => ({
      ok: true,
      value: [
        {
          agent: 'codex',
          agent_status: 'blocked',
          cwd: '/repo',
          focused: true,
          pane_id: 'w1:p1',
          workspace_id: 'ws1',
          state_change_seq: 7,
        },
      ],
    }),
    sendPrompt: async () => {
      prompted = true;
      return { ok: true, value: undefined };
    },
    writePick: async () => {
      wrote = true;
      return {
        ok: true,
        value: {
          pickId: 'pick-1',
          directory: '/tmp/herdr-picks/pick-1',
          notePath: '/tmp/herdr-picks/pick-1/note.md',
          hasScreenshots: false,
        },
      };
    },
  });

  const result = await handleSend({
    url: new URL('http://127.0.0.1:8791/send'),
    readBody: async () => ({ ok: true as const, value: Buffer.alloc(0) }),
    readJson: async () => ({
      ok: true as const,
      value: {
        url: 'http://localhost:3000',
        paneId: 'w1:p1',
        pageNote: 'Review the whole page flow.',
        selections: [],
      },
    }),
  });

  assert.equal(result.status, 409);
  assert.deepEqual(result.body, {
    error:
      'Pane w1:p1 is currently blocked in herdr. Resolve the block in that pane or pick another agent, then resend the review.',
  });
  assert.equal(wrote, false);
  assert.equal(prompted, false);
  tracker.stop();
});

test('revalidates that the selected pane is inside the resolved project scope', async () => {
  let wrote = false;
  const tracker = idleTracker();
  const handleSend = createSendHandler(tracker, {
    listAgents: async () => ({ ok: true, value: [liveAgent] }),
    resolveProjectScope: async () => ({
      ok: true,
      value: { projectDir: '/repo/app', scope: '/repo', source: 'lsof' },
    }),
    rankTargets: async () => ({ ok: true, value: [] }),
    writePick: async () => {
      wrote = true;
      return { ok: false, error: 'should not write' };
    },
  });

  const result = await handleSend(sendContext());
  assert.equal(result.status, 409);
  assert.deepEqual(result.body, {
    error:
      'That agent is not working in the project behind http://localhost:3000. Refresh the targets and pick again.',
  });
  assert.equal(wrote, false);
  tracker.stop();
});

test('writes and prompts after scope revalidation passes, then follows the review', async () => {
  let prompted = false;
  let record: unknown = null;
  const tracker = idleTracker();
  const handleSend = createSendHandler(tracker, {
    listAgents: async () => ({
      ok: true,
      value: [{ ...liveAgent, state_change_seq: 41, agent_session: { kind: 'id', value: 'session-a' } }],
    }),
    writePickRecord: async (directory, written) => {
      record = { directory, ...written };
      return { ok: true, value: undefined };
    },
    now: () => new Date('2026-09-02T10:00:00.000Z'),
    resolveProjectScope: async () => ({
      ok: true,
      value: { projectDir: '/repo/app', scope: '/repo' },
    }),
    rankTargets: async () => ({
      ok: true,
      value: [
        {
          paneId: 'w1:p1',
          workspaceId: 'ws1',
          label: 'Agent',
          agent: 'codex',
          status: 'idle',
          cwd: '/repo',
          focused: true,
          lastActiveSeq: 7,
        },
      ],
    }),
    writePick: async () => ({
      ok: true,
      value: {
        pickId: 'pick-1',
        directory: '/tmp/herdr-picks/pick-1',
        notePath: '/tmp/herdr-picks/pick-1/note.md',
        hasScreenshots: false,
      },
    }),
    sendPrompt: async () => {
      prompted = true;
      return { ok: true, value: undefined };
    },
  });

  const result = await handleSend(sendContext());
  assert.equal(result.status, 200);
  assert.equal(prompted, true);

  const tracked = tracker.get('pick-1');
  assert.equal(tracked?.status, 'queued');
  assert.equal(tracked?.baseSeq, 41);
  assert.equal(tracked?.sessionId, 'session-a');
  assert.deepEqual(record, {
    directory: '/tmp/herdr-picks/pick-1',
    pickId: 'pick-1',
    paneId: 'w1:p1',
    notePath: '/tmp/herdr-picks/pick-1/note.md',
    sessionId: 'session-a',
    baseSeq: 41,
    followUps: 0,
    sentAt: '2026-09-02T10:00:00.000Z',
  });
  tracker.stop();
});
