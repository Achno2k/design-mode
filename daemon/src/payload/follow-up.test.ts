import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { appendFollowUp, countFollowUps, renderFollowUpPrompt } from './follow-up.ts';

async function noteWith(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'design-mode-follow-up-'));
  const notePath = join(directory, 'note.md');
  await writeFile(notePath, content, 'utf8');
  return notePath;
}

test('numbers follow-ups from one and appends each as its own section', async () => {
  const notePath = await noteWith('# Review\n\n## 1. src/App.tsx:12\n\nMake it blue.\n');

  assert.deepEqual(await appendFollowUp(notePath, 'Darker blue, please.'), { ok: true, value: 1 });
  assert.deepEqual(await appendFollowUp(notePath, '  And bolder.  '), { ok: true, value: 2 });

  const note = await readFile(notePath, 'utf8');
  assert.ok(note.endsWith('\n## Follow-up 1\n\nDarker blue, please.\n\n## Follow-up 2\n\nAnd bolder.\n'));
});

test('continues numbering from the highest section already in the note', async () => {
  const notePath = await noteWith('# Review\n\n## Follow-up 1\n\nfirst\n\n## Follow-up 4\n\nfourth');

  assert.deepEqual(await appendFollowUp(notePath, 'fifth'), { ok: true, value: 5 });
  assert.ok((await readFile(notePath, 'utf8')).endsWith('fourth\n\n## Follow-up 5\n\nfifth\n'));
});

test('ignores headings that merely mention a follow-up', () => {
  assert.equal(countFollowUps('## Follow-up 2 was ignored\n### Follow-up 9\n## Follow-up 3\n'), 3);
  assert.equal(countFollowUps(''), 0);
});

test('reports a missing note as a readable failure', async () => {
  const result = await appendFollowUp('/nonexistent/design-mode/note.md', 'hello');
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.error.startsWith('Could not read /nonexistent/design-mode/note.md to add the reply:'));
});

test('renders the prompt that points the agent at the new section', () => {
  assert.equal(
    renderFollowUpPrompt('/tmp/herdr-picks/p/note.md', 2),
    'Browser review follow-up 2 — read the "## Follow-up 2" section at the end of @/tmp/herdr-picks/p/note.md and address it.',
  );
});
