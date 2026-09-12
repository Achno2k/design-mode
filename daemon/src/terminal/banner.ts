import { setTimeout as sleep } from 'node:timers/promises';

import { gradientText } from './paint.ts';
import { palette } from './palette.ts';
import type { Screen } from './screen.ts';
import { createWordmark, type Wordmark } from './wordmark.ts';

/**
 * The start-up wordmark, ported from the agents-cli banner: letters arrive left
 * to right, each glitching through block shades before it snaps into shape, two
 * of them flicker once, and the version line fades in underneath. Five letters
 * at LETTER_MS keeps it under a second, and it runs on timers, so the
 * server is already answering while it plays.
 */
const LETTER_MS = 130;
const GLITCH_FRAME_MS = 35;
const GLITCH_FRAMES = 3;
const FLICKER_MS = 60;
const FLICKER_LETTERS = 2;
const FADE_STEP_MS = 60;
const FADE_SHADES = ['░', '▒', '▓'];

const MARGIN = '  ';
const CLEAR_LINE = '\x1b[2K';

export type BannerOptions = {
  version?: string;
  random?: () => number;
  wait?: (ms: number) => Promise<unknown>;
};

type Redraw = () => void;
type Wait = (ms: number) => Promise<unknown>;

/** Animate the wordmark in place, or print a one-line title where it would not fit. */
export async function playBanner(target: Screen, options: BannerOptions = {}): Promise<void> {
  const { paint } = target;
  const subtitle = options.version ? `nudge v${options.version} · design mode for herdr` : 'nudge · design mode for herdr';
  const wordmark = createWordmark(options.random);

  if (target.columns() < MARGIN.length + wordmark.width) {
    target.raw(`\n${MARGIN}${paint.bold(gradientText(subtitle, paint, palette.gradient))}\n\n`);
    return;
  }

  const wait = options.wait ?? ((ms: number) => sleep(ms));
  const hidden = ' '.repeat(subtitle.length);
  const draw = (sub: string, redraw = true): void => target.raw(renderFrame(target, wordmark, sub, redraw));

  target.hideCursor();
  try {
    target.raw('\n');
    draw(hidden, false);
    await arrive(wordmark, () => draw(hidden), wait);
    await flicker(wordmark, () => draw(hidden), wait);
    for (const shade of FADE_SHADES) {
      draw(shade.repeat(subtitle.length));
      await wait(FADE_STEP_MS);
    }
    draw(subtitle);
    target.raw('\n');
  } finally {
    target.showCursor();
  }
}

async function arrive(wordmark: Wordmark, redraw: Redraw, wait: Wait): Promise<void> {
  for (let index = 0; index < wordmark.letters; index += 1) {
    for (let frame = 0; frame < GLITCH_FRAMES; frame += 1) {
      wordmark.glitch(index);
      redraw();
      await wait(GLITCH_FRAME_MS);
    }
    wordmark.settle(index);
    redraw();
    await wait(LETTER_MS - GLITCH_FRAMES * GLITCH_FRAME_MS);
  }
}

async function flicker(wordmark: Wordmark, redraw: Redraw, wait: Wait): Promise<void> {
  const picked = wordmark.pickSettled(FLICKER_LETTERS);
  for (const index of picked) wordmark.shade(index, '░');
  redraw();
  await wait(FLICKER_MS);
  for (const index of picked) wordmark.settle(index);
  redraw();
}

/** The wordmark, a spacer and the subtitle, optionally moving back up over the last frame first. */
function renderFrame(target: Screen, wordmark: Wordmark, subtitle: string, redraw: boolean): string {
  const rows = [...wordmark.render(target.paint), '', target.paint.fg(palette.muted, subtitle)];
  const up = redraw ? `\x1b[${rows.length}A\r` : '';
  return up + rows.map((row) => `${CLEAR_LINE}${MARGIN}${row}\n`).join('');
}
