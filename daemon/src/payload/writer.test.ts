import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { err } from '../result.ts';
import { writeBlob } from './blob-store.ts';
import { writePick } from './writer.ts';

test('writes the page note into the markdown note', async () => {
  const written = await writePick(
    {
      url: 'http://localhost:3000',
      paneId: 'w1:p1',
      pageNote: 'Check the empty state too.',
      selections: [
        {
          kind: 'element',
          comment: 'padding is inconsistent',
          tag: 'article',
          selector: 'main > article',
          classes: ['card'],
          text: 'Pro plan',
          box: { x: 410, y: 220, width: 320, height: 186 },
          styles: { padding: '24px 16px' },
        },
      ],
    },
    new Date('2025-01-02T03:04:05.000Z'),
  );

  assert.equal(written.ok, true);

  const directory = written.ok ? written.value.directory : '';
  try {
    const note = await readFile(written.ok ? written.value.notePath : '', 'utf8');
    assert.match(note, /## Page note\n\n> Check the empty state too\./);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('moves an uploaded blob into the private pick directory', async () => {
  const picksDirectory = await mkdtemp(join(tmpdir(), 'design-mode-picks-'));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const blob = await writeBlob(png, picksDirectory);
  assert.equal(blob.ok, true);
  const blobId = blob.ok ? blob.value : '';
  assert.equal((await stat(join(picksDirectory, '.blobs'))).mode & 0o777, 0o700);
  assert.equal(
    (await stat(join(picksDirectory, '.blobs', `${blobId}.png`))).mode & 0o777,
    0o600,
  );

  const written = await writePick(
    {
      url: 'http://localhost:3000',
      paneId: 'w1:p1',
      selections: [
        {
          kind: 'element',
          comment: 'Use the uploaded image.',
          tag: 'div',
          selector: 'div',
          classes: [],
          text: '',
          box: { x: 0, y: 0, width: 20, height: 20 },
          styles: {},
          screenshotBlobId: blobId,
          screenshot: Buffer.from('not a png').toString('base64'),
        },
      ],
    },
    new Date('2025-01-02T03:04:05.000Z'),
    { picksDirectory },
  );

  assert.equal(written.ok, true);
  const directory = written.ok ? written.value.directory : '';
  assert.deepEqual(await readFile(join(directory, 'shot-1.png')), png);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(join(directory, 'shot-1.png'))).mode & 0o777, 0o600);
  assert.equal((await stat(join(directory, 'note.md'))).mode & 0o777, 0o600);
  await assert.rejects(access(join(picksDirectory, '.blobs', `${blobId}.png`)));
  assert.match(await readFile(join(directory, 'note.md'), 'utf8'), /shot-1\.png/);
  await rm(picksDirectory, { recursive: true, force: true });
});

test('renders without an image when an uploaded blob id is unknown', async () => {
  const picksDirectory = await mkdtemp(join(tmpdir(), 'design-mode-picks-'));
  const written = await writePick(
    {
      url: 'http://localhost:3000',
      paneId: 'w1:p1',
      selections: [
        {
          kind: 'drawing',
          comment: 'Missing upload should not block this.',
          box: { x: 0, y: 0, width: 10, height: 10 },
          strokes: [
            {
              color: '#000000',
              width: 1,
              points: [{ x: 0, y: 0, pressure: 1 }],
            },
          ],
          screenshotBlobId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        },
      ],
    },
    new Date('2025-01-02T03:04:05.000Z'),
    { picksDirectory },
  );

  assert.equal(written.ok, true);
  assert.equal(written.ok && written.value.hasScreenshots, false);
  assert.doesNotMatch(
    await readFile(written.ok ? written.value.notePath : '', 'utf8'),
    /shot-1\.png/,
  );
  await rm(picksDirectory, { recursive: true, force: true });
});

test('does not write or advertise an invalid inline screenshot', async () => {
  const picksDirectory = await mkdtemp(join(tmpdir(), 'design-mode-picks-'));
  const written = await writePick(
    {
      url: 'http://localhost:3000',
      paneId: 'w1:p1',
      selections: [
        {
          kind: 'element',
          comment: 'No fake image.',
          tag: 'div',
          selector: '',
          classes: [],
          text: '',
          box: { x: 0, y: 0, width: 1, height: 1 },
          styles: {},
          screenshot: Buffer.from('not png').toString('base64'),
        },
      ],
    },
    new Date('2025-01-02T03:04:05.000Z'),
    { picksDirectory },
  );

  assert.equal(written.ok, true);
  assert.equal(written.ok && written.value.hasScreenshots, false);
  const note = await readFile(written.ok ? written.value.notePath : '', 'utf8');
  assert.doesNotMatch(note, /shot-1\.png/);
  await rm(picksDirectory, { recursive: true, force: true });
});

test('does not fail a successful write when TTL cleanup fails', async () => {
  const picksDirectory = await mkdtemp(join(tmpdir(), 'design-mode-picks-'));
  const written = await writePick(
    {
      url: 'http://localhost:3000',
      paneId: 'w1:p1',
      pageNote: 'Keep this review.',
      selections: [],
    },
    new Date(),
    {
      picksDirectory,
      cleanup: async () => err('Cleanup failed for the test.'),
    },
  );

  assert.equal(written.ok, true);
  await rm(picksDirectory, { recursive: true, force: true });
});

test('writes a page-note-only review with zero selections', async () => {
  const written = await writePick(
    {
      url: 'http://localhost:3000',
      paneId: 'w1:p1',
      pageNote: 'Check the onboarding flow as a whole.',
      selections: [],
    },
    new Date('2025-01-02T03:04:05.000Z'),
  );

  assert.equal(written.ok, true);
  assert.equal(written.ok && written.value.hasScreenshots, false);

  const directory = written.ok ? written.value.directory : '';
  try {
    const note = await readFile(written.ok ? written.value.notePath : '', 'utf8');
    assert.match(note, /A general page note was added in the browser\./);
    assert.match(note, /## Page note\n\n> Check the onboarding flow as a whole\./);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
