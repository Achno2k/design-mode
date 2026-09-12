import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPaint } from './paint.ts';
import { createWordmark, WORDMARK_ROWS } from './wordmark.ts';

const plain = createPaint('none');

function settled() {
  const wordmark = createWordmark(() => 0.5);
  for (let index = 0; index < wordmark.letters; index += 1) wordmark.settle(index);
  return wordmark;
}

test('spells NUDGE in five rows the width it claims', () => {
  const wordmark = settled();
  const rows = wordmark.render(plain);

  assert.equal(wordmark.letters, 5);
  assert.equal(rows.length, WORDMARK_ROWS);
  for (const row of rows) assert.equal(row.length, wordmark.width);
  assert.equal(rows[0], '█   █ █   █ ████   ████ █████');
});

test('draws nothing before any letter arrives', () => {
  const rows = createWordmark().render(plain);
  for (const row of rows) assert.equal(row.trim(), '');
});

test('glitches a letter in block shades inside its own columns', () => {
  const wordmark = createWordmark(() => 0.99);
  wordmark.glitch(0);
  const rows = wordmark.render(plain);

  assert.ok(rows.some((row) => /[░▒▓█]/.test(row)));
  for (const row of rows) assert.equal(row.slice(5).trim(), '');
});

test('only picks settled letters to flicker', () => {
  const wordmark = createWordmark(() => 0.3);
  wordmark.settle(1);
  wordmark.settle(3);

  assert.deepEqual(wordmark.pickSettled(5).sort(), [1, 3]);
  assert.equal(wordmark.pickSettled(1).length, 1);
});

test('colours settled letters and leaves the gaps unpainted', () => {
  const rows = settled().render(createPaint('truecolor'));
  assert.match(rows[0] ?? '', /\x1b\[38;2;\d+;\d+;\d+m█/);
  assert.doesNotMatch(rows[0] ?? '', /\x1b\[38;2;\d+;\d+;\d+m /);
});
