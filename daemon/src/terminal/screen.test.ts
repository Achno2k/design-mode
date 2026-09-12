import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createScreen, type TerminalStream } from './screen.ts';

function fakeStream(isTTY: boolean): TerminalStream & { chunks: string[] } {
  const chunks: string[] = [];
  return {
    chunks,
    isTTY,
    columns: 80,
    getColorDepth: () => 24,
    write(chunk) {
      chunks.push(chunk);
      return true;
    },
  };
}

const TERMINAL_ENV = { TERM: 'xterm-256color' };

test('overwrites the previous line when the same key repeats', () => {
  const out = fakeStream(true);
  const screen = createScreen(out, fakeStream(true), TERMINAL_ENV);

  screen.line('rebuilt 1', { replaceKey: 'rebuild' });
  screen.line('rebuilt 2', { replaceKey: 'rebuild' });
  screen.line('sent');
  screen.line('rebuilt 3', { replaceKey: 'rebuild' });

  assert.deepEqual(out.chunks, ['rebuilt 1\n', '\x1b[1A\r\x1b[2Krebuilt 2\n', 'sent\n', 'rebuilt 3\n']);
});

test('never rewrites lines off a terminal', () => {
  const out = fakeStream(false);
  const screen = createScreen(out, fakeStream(false), TERMINAL_ENV);

  screen.line('rebuilt 1', { replaceKey: 'rebuild' });
  screen.line('rebuilt 2', { replaceKey: 'rebuild' });

  assert.equal(screen.interactive, false);
  assert.deepEqual(out.chunks, ['rebuilt 1\n', 'rebuilt 2\n']);
});

test('holds lines until released while raw writes pass through', () => {
  const out = fakeStream(true);
  const screen = createScreen(out, fakeStream(true), TERMINAL_ENV);

  const release = screen.hold();
  screen.line('listening');
  screen.raw('frame\n');
  assert.deepEqual(out.chunks, ['frame\n']);

  release();
  assert.deepEqual(out.chunks, ['frame\n', 'listening\n']);
});

test('clears by scrolling the screen into scrollback, and only on a terminal', () => {
  const out = Object.assign(fakeStream(true), { rows: 4 });
  createScreen(out, fakeStream(true), TERMINAL_ENV).clear();
  assert.deepEqual(out.chunks, ['\n\n\n\x1b[H\x1b[J']);

  const piped = fakeStream(false);
  createScreen(piped, fakeStream(false), TERMINAL_ENV).clear();
  assert.deepEqual(piped.chunks, []);
});

test('treats a dumb terminal or the plain switch as non-interactive', () => {
  assert.equal(createScreen(fakeStream(true), fakeStream(true), { TERM: 'dumb' }).interactive, false);
  const plain = { ...TERMINAL_ENV, NUDGE_PLAIN: '1' };
  assert.equal(createScreen(fakeStream(true), fakeStream(true), plain).interactive, false);
});
