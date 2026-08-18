import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { test } from 'node:test';

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
