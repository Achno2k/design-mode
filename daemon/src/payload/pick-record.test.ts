import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { isPickId, readPickRecord, writePickRecord, type PickRecord } from './pick-record.ts';

const record: PickRecord = {
  pickId: 'pick-1',
  paneId: 'w1:p1',
  notePath: '/tmp/nudge-picks/pick-1/note.md',
  sessionId: 'session-a',
  baseSeq: 10,
  followUps: 0,
  sentAt: '2026-09-02T10:00:00.000Z',
};

async function picksDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'design-mode-picks-'));
}

test('round-trips a record through pick.json', async () => {
  const root = await picksDirectory();
  await mkdir(join(root, 'pick-1'));

  assert.deepEqual(await writePickRecord(join(root, 'pick-1'), record), { ok: true, value: undefined });
  assert.deepEqual(await readPickRecord('pick-1', root), { ok: true, value: record });
});

test('answers null for a review that is not on disk', async () => {
  assert.deepEqual(await readPickRecord('pick-9', await picksDirectory()), { ok: true, value: null });
});

test('refuses ids that could leave the picks folder', async () => {
  assert.equal(isPickId('../etc'), false);
  assert.equal(isPickId('2026-09-02-10-00-00-abc-DEF_1'), true);
  assert.deepEqual(await readPickRecord('../etc', await picksDirectory()), {
    ok: false,
    error: 'That review id is not valid.',
  });
});

test('rejects a record missing its base seq', async () => {
  const root = await picksDirectory();
  await mkdir(join(root, 'pick-1'));
  await writeFile(join(root, 'pick-1', 'pick.json'), JSON.stringify({ ...record, baseSeq: 'ten' }));

  assert.deepEqual(await readPickRecord('pick-1', root), {
    ok: false,
    error: 'The record for review pick-1 is not in a shape this daemon understands.',
  });
});
