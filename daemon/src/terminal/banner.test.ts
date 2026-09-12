import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';

import { playBanner } from './banner.ts';
import { createScreen, type TerminalStream } from './screen.ts';

function terminal(columns: number): { stream: TerminalStream; output: () => string } {
  const chunks: string[] = [];
  const stream: TerminalStream = {
    isTTY: true,
    columns,
    getColorDepth: () => 24,
    write(chunk) {
      chunks.push(chunk);
      return true;
    },
  };
  return { stream, output: () => chunks.join('') };
}

const instant = async (): Promise<void> => {};

test('ends on the finished wordmark and the version, with the cursor restored', async () => {
  const { stream, output } = terminal(120);
  const screen = createScreen(stream, stream, { TERM: 'xterm-256color' });

  await playBanner(screen, { version: '0.3.1', random: () => 0.5, wait: instant });

  const text = output();
  const lastFrame = stripVTControlCharacters(text.slice(text.lastIndexOf('\x1b[7A')));
  assert.match(lastFrame, /█ {3}█ █ {3}█ ████/);
  assert.match(lastFrame, /nudge v0\.3\.1 · design mode for herdr/);
  assert.ok(text.includes('\x1b[?25l'));
  assert.ok(text.endsWith('\x1b[?25h'));
});

test('falls back to a one-line title where the wordmark would wrap', async () => {
  const { stream, output } = terminal(24);
  const screen = createScreen(stream, stream, { TERM: 'xterm-256color' });

  await playBanner(screen, { version: '0.3.1', wait: instant });

  assert.equal(stripVTControlCharacters(output()), '\n  nudge v0.3.1 · design mode for herdr\n\n');
});
