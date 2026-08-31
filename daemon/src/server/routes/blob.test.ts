import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBlobHandler } from './blob.ts';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

test('accepts PNG bytes and returns the contract blob id', async () => {
  let stored: Buffer | null = null;
  const handler = createBlobHandler({
    writeBlob: async (bytes) => {
      stored = bytes;
      return { ok: true, value: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' };
    },
  });

  const result = await handler({
    url: new URL('http://localhost/blob'),
    readBody: async () => ({ ok: true, value: PNG }),
    readJson: async () => ({ ok: false, error: 'unused' }),
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { blobId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' });
  assert.deepEqual(stored, PNG);
});

test('rejects non-PNG and oversized bodies before storing', async () => {
  let writes = 0;
  const handler = createBlobHandler({
    writeBlob: async () => {
      writes += 1;
      return { ok: true, value: 'unused' };
    },
  });

  const invalid = await handler({
    url: new URL('http://localhost/blob'),
    readBody: async () => ({ ok: true, value: Buffer.from('not png') }),
    readJson: async () => ({ ok: false, error: 'unused' }),
  });
  assert.deepEqual(invalid, {
    status: 400,
    body: { error: 'That screenshot was not a valid PNG.' },
  });

  const oversized = await handler({
    url: new URL('http://localhost/blob'),
    readBody: async () => ({ ok: false, error: 'The request body is larger than 16 MB.' }),
    readJson: async () => ({ ok: false, error: 'unused' }),
  });
  assert.equal(oversized.status, 413);
  assert.equal(writes, 0);
});
