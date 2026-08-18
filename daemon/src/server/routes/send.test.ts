import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSendHandler } from './send.ts';

test('rejects a blocked target before writing files or prompting', async () => {
  let wrote = false;
  let prompted = false;

  const handleSend = createSendHandler({
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
});
